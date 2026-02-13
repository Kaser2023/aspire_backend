const { Subscription, Player, Program, Branch, Payment, User, Notification, SubscriptionFreeze } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES, SUBSCRIPTION_STATUS } = require('../config/constants');
const smsService = require('../services/sms.service');

/**
 * @desc    Get all subscriptions
 * @route   GET /api/subscriptions
 * @access  Private
 */
exports.getAllSubscriptions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, player_id, branch_id, program_id } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (status) where.status = status;
  if (player_id) where.player_id = player_id;
  if (program_id) where.program_id = program_id;

  // Role-based filtering
  if (req.user.role === ROLES.PARENT) {
    const playerIds = await Player.findAll({
      where: { [Op.or]: [{ parent_id: req.user.id }, { self_user_id: req.user.id }] },
      attributes: ['id']
    });
    where.player_id = { [Op.in]: playerIds.map(p => p.id) };
  } else if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    const players = await Player.findAll({
      where: { branch_id: req.user.branch_id },
      attributes: ['id']
    });
    where.player_id = { [Op.in]: players.map(p => p.id) };
  }

  const subscriptions = await Subscription.findAndCountAll({
    where,
    include: [
      { 
        association: 'player', 
        attributes: ['id', 'first_name', 'last_name'],
        include: [{ 
          association: 'parent', 
          attributes: ['id', 'first_name', 'last_name', 'phone'] 
        }]
      },
      { association: 'program', attributes: ['id', 'name', 'price_monthly'] }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(subscriptions, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get subscription by ID
 * @route   GET /api/subscriptions/:id
 * @access  Private
 */
exports.getSubscriptionById = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findByPk(req.params.id, {
    include: [
      { association: 'player' },
      { association: 'program' },
      { association: 'payments' }
    ]
  });

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  res.json({
    success: true,
    data: subscription
  });
});

/**
 * @desc    Create new subscription
 * @route   POST /api/subscriptions
 * @access  Private
 */
exports.createSubscription = asyncHandler(async (req, res) => {
  const { player_id, program_id, start_date, end_date, amount, discount_amount } = req.body;

  // Validate player
  const player = await Player.findByPk(player_id);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Validate program
  const program = await Program.findByPk(program_id);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  const finalAmount = amount || program.price_monthly;
  const finalDiscount = discount_amount || 0;
  const totalAmount = parseFloat(finalAmount) - parseFloat(finalDiscount);

  // Check for active subscription freezes that overlap with this subscription period
  let adjustedEndDate = end_date;
  let freezeNote = '';

  try {
    const today = new Date().toISOString().split('T')[0];
    const activeFreezes = await SubscriptionFreeze.findAll({
      where: {
        status: { [Op.in]: ['scheduled', 'active'] },
        end_date: { [Op.gte]: today },
        applied: true
      }
    });

    for (const freeze of activeFreezes) {
      // Check if freeze scope matches this subscription
      let matches = false;
      if (freeze.scope === 'global') {
        matches = true;
      } else if (freeze.scope === 'program' && freeze.program_id === program_id) {
        matches = true;
      } else if (freeze.scope === 'branch') {
        matches = program.branch_id === freeze.branch_id;
      }

      if (matches) {
        const currentEnd = new Date(adjustedEndDate);
        currentEnd.setDate(currentEnd.getDate() + freeze.freeze_days);
        adjustedEndDate = currentEnd.toISOString().split('T')[0];
        freezeNote += `\n[Freeze] Extended ${freeze.freeze_days} days - ${freeze.title} (${freeze.start_date} to ${freeze.end_date})`;
      }
    }
  } catch (err) {
    console.error('Error checking active freezes for new subscription:', err);
  }

  const subscription = await Subscription.create({
    player_id,
    program_id,
    start_date,
    end_date: adjustedEndDate,
    amount: finalAmount,
    discount_amount: finalDiscount,
    total_amount: totalAmount,
    status: SUBSCRIPTION_STATUS.PENDING,
    notes: freezeNote || null
  });

  res.status(201).json({
    success: true,
    message: freezeNote
      ? `Subscription created successfully. End date extended due to active freeze(s).`
      : 'Subscription created successfully',
    data: subscription
  });
});

/**
 * @desc    Update subscription
 * @route   PUT /api/subscriptions/:id
 * @access  Private
 */
exports.updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findByPk(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  await subscription.update(req.body);

  res.json({
    success: true,
    message: 'Subscription updated successfully',
    data: subscription
  });
});

/**
 * @desc    Renew subscription
 * @route   POST /api/subscriptions/:id/renew
 * @access  Private
 */
exports.renewSubscription = asyncHandler(async (req, res) => {
  const { duration_months = 1, amount } = req.body;

  const subscription = await Subscription.findByPk(req.params.id, {
    include: [{ association: 'program' }]
  });

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  // Calculate new end date
  const currentEndDate = new Date(subscription.end_date);
  const newEndDate = new Date(currentEndDate);
  newEndDate.setMonth(newEndDate.getMonth() + duration_months);

  // Create new subscription or extend current
  await subscription.update({
    end_date: newEndDate,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    amount: amount || subscription.program.price_monthly * duration_months
  });

  res.json({
    success: true,
    message: 'Subscription renewed successfully',
    data: subscription
  });
});

/**
 * @desc    Apply discount to subscription
 * @route   POST /api/subscriptions/:id/discount
 * @access  Private
 */
exports.applyDiscount = asyncHandler(async (req, res) => {
  const { discount_type, discount_value, reason } = req.body;

  const subscription = await Subscription.findByPk(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  let discountAmount = 0;
  if (discount_type === 'percentage') {
    discountAmount = (subscription.amount * discount_value) / 100;
  } else if (discount_type === 'fixed') {
    discountAmount = discount_value;
  }

  await subscription.update({
    discount_amount: discountAmount,
    discount_reason: reason
  });

  res.json({
    success: true,
    message: 'Discount applied successfully',
    data: {
      original_amount: subscription.amount,
      discount_amount: discountAmount,
      final_amount: subscription.amount - discountAmount
    }
  });
});

/**
 * @desc    Cancel subscription
 * @route   PATCH /api/subscriptions/:id/cancel
 * @access  Private
 */
exports.cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findByPk(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  await subscription.update({ status: SUBSCRIPTION_STATUS.CANCELLED });

  res.json({
    success: true,
    message: 'Subscription cancelled successfully'
  });
});

/**
 * @desc    Get subscription statistics
 * @route   GET /api/subscriptions/stats
 * @access  Private
 */
exports.getSubscriptionStats = asyncHandler(async (req, res) => {
  const { branch_id } = req.query;
  
  let playerWhere = {};
  if (branch_id) {
    const players = await Player.findAll({
      where: { branch_id },
      attributes: ['id']
    });
    playerWhere = { player_id: { [Op.in]: players.map(p => p.id) } };
  }

  const [total, active, expired, pending, cancelled] = await Promise.all([
    Subscription.count({ where: playerWhere }),
    Subscription.count({ where: { ...playerWhere, status: SUBSCRIPTION_STATUS.ACTIVE } }),
    Subscription.count({ where: { ...playerWhere, status: SUBSCRIPTION_STATUS.EXPIRED } }),
    Subscription.count({ where: { ...playerWhere, status: SUBSCRIPTION_STATUS.PENDING } }),
    Subscription.count({ where: { ...playerWhere, status: SUBSCRIPTION_STATUS.CANCELLED } })
  ]);

  res.json({
    success: true,
    data: {
      total,
      active,
      expired,
      pending,
      cancelled
    }
  });
});

/**
 * @desc    Get expiring subscriptions
 * @route   GET /api/subscriptions/expiring
 * @access  Private
 */
exports.getExpiringSubscriptions = asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + parseInt(days));

  const subscriptions = await Subscription.findAll({
    where: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      end_date: {
        [Op.between]: [new Date(), expiryDate]
      }
    },
    include: [
      { association: 'player', include: [{ association: 'parent', attributes: ['id', 'phone', 'first_name'] }] },
      { association: 'program', attributes: ['id', 'name'] }
    ],
    order: [['end_date', 'ASC']]
  });

  res.json({
    success: true,
    data: subscriptions
  });
});

/**
 * @desc    Get overdue subscriptions
 * @route   GET /api/subscriptions/overdue
 * @access  Private
 */
exports.getOverdueSubscriptions = asyncHandler(async (req, res) => {
  const subscriptions = await Subscription.findAll({
    where: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      end_date: {
        [Op.lt]: new Date()
      }
    },
    include: [
      { association: 'player', include: [{ association: 'parent', attributes: ['id', 'phone', 'first_name'] }] },
      { association: 'program', attributes: ['id', 'name'] }
    ],
    order: [['end_date', 'ASC']]
  });

  res.json({
    success: true,
    data: subscriptions
  });
});

/**
 * @desc    Send renewal reminder notification
 * @route   POST /api/subscriptions/:id/send-reminder
 * @access  Private
 */
exports.sendRenewalReminder = asyncHandler(async (req, res) => {
  const { type = 'notification' } = req.body; // 'notification', 'sms', or 'both'
  
  const subscription = await Subscription.findByPk(req.params.id, {
    include: [
      { 
        association: 'player', 
        include: [{ 
          association: 'parent', 
          attributes: ['id', 'phone', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar'] 
        }] 
      },
      { association: 'program', attributes: ['id', 'name', 'name_ar'] }
    ]
  });

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  const parent = subscription.player?.parent;
  if (!parent) {
    throw new AppError('Parent not found for this subscription', 404);
  }

  const daysRemaining = Math.ceil((new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24));
  const playerName = `${subscription.player.first_name} ${subscription.player.last_name}`;
  const programName = subscription.program?.name || 'Program';
  const programNameAr = subscription.program?.name_ar || programName;
  
  let notificationSent = false;
  let smsSent = false;
  let smsError = null;

  // Send notification
  if (type === 'notification' || type === 'both') {
    await Notification.create({
      user_id: parent.id,
      type: 'subscription_expiring',
      title: 'Subscription Renewal Reminder',
      title_ar: 'تذكير بتجديد الاشتراك',
      message: `${playerName}'s subscription to ${programName} will expire in ${daysRemaining} days. Please renew to continue training.`,
      message_ar: `اشتراك ${playerName} في ${programNameAr} سينتهي خلال ${daysRemaining} يوم. يرجى التجديد للاستمرار في التدريب.`,
      data: {
        subscription_id: subscription.id,
        player_id: subscription.player_id,
        days_remaining: daysRemaining,
        end_date: subscription.end_date
      }
    });
    notificationSent = true;
  }

  // Send SMS
  if (type === 'sms' || type === 'both') {
    if (parent.phone) {
      try {
        const smsMessage = `Dear ${parent.first_name}, ${playerName}'s subscription expires in ${daysRemaining} days. Please renew. - Academy`;
        await smsService.send(parent.phone, smsMessage);
        smsSent = true;
      } catch (err) {
        smsError = err.message;
      }
    } else {
      smsError = 'No phone number on file';
    }
  }

  res.json({
    success: true,
    message: 'Reminder sent successfully',
    data: {
      notification_sent: notificationSent,
      sms_sent: smsSent,
      sms_error: smsError
    }
  });
});

/**
 * @desc    Send bulk renewal reminders
 * @route   POST /api/subscriptions/send-bulk-reminders
 * @access  Private
 */
exports.sendBulkReminders = asyncHandler(async (req, res) => {
  const { subscription_ids, type = 'notification' } = req.body;

  if (!subscription_ids || !Array.isArray(subscription_ids) || subscription_ids.length === 0) {
    throw new AppError('Please provide subscription IDs', 400);
  }

  const subscriptions = await Subscription.findAll({
    where: { id: { [Op.in]: subscription_ids } },
    include: [
      { 
        association: 'player', 
        include: [{ 
          association: 'parent', 
          attributes: ['id', 'phone', 'first_name', 'last_name'] 
        }] 
      },
      { association: 'program', attributes: ['id', 'name', 'name_ar'] }
    ]
  });

  const results = {
    total: subscriptions.length,
    notifications_sent: 0,
    sms_sent: 0,
    sms_failed: 0,
    errors: []
  };

  const smsMessages = [];

  for (const subscription of subscriptions) {
    const parent = subscription.player?.parent;
    if (!parent) continue;

    const daysRemaining = Math.ceil((new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24));
    const playerName = `${subscription.player.first_name} ${subscription.player.last_name}`;
    const programName = subscription.program?.name || 'Program';
    const programNameAr = subscription.program?.name_ar || programName;

    // Create notifications
    if (type === 'notification' || type === 'both') {
      try {
        await Notification.create({
          user_id: parent.id,
          type: 'subscription_expiring',
          title: 'Subscription Renewal Reminder',
          title_ar: 'تذكير بتجديد الاشتراك',
          message: `${playerName}'s subscription to ${programName} will expire in ${daysRemaining} days. Please renew to continue training.`,
          message_ar: `اشتراك ${playerName} في ${programNameAr} سينتهي خلال ${daysRemaining} يوم. يرجى التجديد للاستمرار في التدريب.`,
          data: {
            subscription_id: subscription.id,
            player_id: subscription.player_id,
            days_remaining: daysRemaining,
            end_date: subscription.end_date
          }
        });
        results.notifications_sent++;
      } catch (err) {
        results.errors.push({ subscription_id: subscription.id, error: 'Failed to create notification' });
      }
    }

    // Collect SMS messages for bulk sending
    if ((type === 'sms' || type === 'both') && parent.phone) {
      smsMessages.push({
        to: parent.phone,
        message: `Dear ${parent.first_name}, ${playerName}'s subscription expires in ${daysRemaining} days. Please renew. - Academy`
      });
    }
  }

  // Send bulk SMS
  if (smsMessages.length > 0) {
    const smsResult = await smsService.sendBulk(smsMessages);
    results.sms_sent = smsResult.successful;
    results.sms_failed = smsResult.failed;
    if (smsResult.errors.length > 0) {
      results.errors.push(...smsResult.errors.map(e => ({ sms_error: e })));
    }
  }

  res.json({
    success: true,
    message: `Reminders sent: ${results.notifications_sent} notifications, ${results.sms_sent} SMS`,
    data: results
  });
});

/**
 * @desc    Get subscription expiry summary
 * @route   GET /api/subscriptions/expiry-summary
 * @access  Private
 */
exports.getExpirySummary = asyncHandler(async (req, res) => {
  const { branch_id } = req.query;
  
  let playerWhere = {};
  if (branch_id) {
    const players = await Player.findAll({
      where: { branch_id },
      attributes: ['id']
    });
    playerWhere = { player_id: { [Op.in]: players.map(p => p.id) } };
  }

  const today = new Date();
  const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in14Days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [expired, critical, urgent, soon, upcoming] = await Promise.all([
    // Already expired
    Subscription.count({
      where: {
        ...playerWhere,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        end_date: { [Op.lt]: today }
      }
    }),
    // Critical: Expires within 3 days
    Subscription.count({
      where: {
        ...playerWhere,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        end_date: { [Op.between]: [today, in3Days] }
      }
    }),
    // Urgent: Expires within 7 days
    Subscription.count({
      where: {
        ...playerWhere,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        end_date: { [Op.between]: [in3Days, in7Days] }
      }
    }),
    // Soon: Expires within 14 days
    Subscription.count({
      where: {
        ...playerWhere,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        end_date: { [Op.between]: [in7Days, in14Days] }
      }
    }),
    // Upcoming: Expires within 30 days
    Subscription.count({
      where: {
        ...playerWhere,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        end_date: { [Op.between]: [in14Days, in30Days] }
      }
    })
  ]);

  res.json({
    success: true,
    data: {
      expired,
      critical,
      urgent,
      soon,
      upcoming,
      total_needing_attention: expired + critical + urgent + soon
    }
  });
});
