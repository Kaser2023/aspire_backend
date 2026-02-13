const { Payment, User, Player, Subscription, Branch, Program, ProgramPricingPlan } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES, PAYMENT_STATUS } = require('../config/constants');
const NotificationService = require('../services/notification.service');
const paymentService = require('../services/payment.service');
const { logAuditEvent, getLatestAuditMap } = require('../utils/auditLogger');

const toDateOnly = (dateValue) => new Date(dateValue).toISOString().split('T')[0];

const addMonths = (dateValue, months) => {
  const date = new Date(dateValue);
  date.setMonth(date.getMonth() + (months || 1));
  return date;
};

const getRenewalAnchor = async ({ playerId, programId }) => {
  const where = {
    player_id: playerId,
    status: { [Op.in]: ['active', 'expired', 'suspended', 'pending'] }
  };
  if (programId) where.program_id = programId;

  const latestSubscription = await Subscription.findOne({
    where,
    attributes: ['id', 'end_date'],
    order: [['end_date', 'DESC'], ['created_at', 'DESC']]
  });

  if (latestSubscription?.end_date) {
    return { startDate: new Date(latestSubscription.end_date), renewedFromId: latestSubscription.id };
  }

  return { startDate: new Date(), renewedFromId: null };
};

const createSubscriptionFromPayment = async ({
  payment,
  pricingPlan,
  programIdOverride = null,
  notes = null
}) => {
  if (!payment?.player_id || !pricingPlan) return null;

  const programId = programIdOverride || pricingPlan.program_id;
  const { startDate, renewedFromId } = await getRenewalAnchor({
    playerId: payment.player_id,
    programId
  });
  const endDate = addMonths(startDate, pricingPlan.duration_months || 1);

  return Subscription.create({
    player_id: payment.player_id,
    program_id: programId,
    payment_id: payment.id,
    pricing_plan_id: pricingPlan.id,
    start_date: toDateOnly(startDate),
    end_date: toDateOnly(endDate),
    amount: parseFloat(payment.amount || 0),
    discount_amount: parseFloat(payment.discount_amount || 0),
    total_amount: parseFloat(payment.total_amount || payment.amount || 0),
    status: 'active',
    is_auto_renew: false,
    renewed_from_id: renewedFromId,
    notes
  });
};

/**
 * @desc    Get all payments
 * @route   GET /api/payments
 * @access  Private/Admin
 */
exports.getAllPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, payment_method, branch_id, start_date, end_date } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (search) {
    where[Op.or] = [
      { invoice_number: { [Op.like]: `%${search}%` } }
    ];
  }

  if (status) where.status = status;
  if (payment_method) where.payment_method = payment_method;
  if (branch_id) where.branch_id = branch_id;

  if (start_date && end_date) {
    where.created_at = {
      [Op.between]: [new Date(start_date), new Date(end_date)]
    };
  }

  // Role-based filtering
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  const payments = await Payment.findAndCountAll({
    where,
    include: [
      { association: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { 
        association: 'player', 
        attributes: ['id', 'first_name', 'last_name', 'registration_number', 'program_id'],
        include: [{ association: 'program', attributes: ['id', 'name', 'name_ar'], required: false }]
      },
      { association: 'branch', attributes: ['id', 'name', 'code'] },
      { 
        association: 'subscription', 
        attributes: ['id', 'plan_type', 'start_date', 'end_date', 'status', 'notes'],
        required: false
      },
      {
        association: 'pricing_plan',
        attributes: ['id', 'name', 'name_ar', 'duration_months', 'price'],
        required: false
      },
      {
        association: 'processor',
        attributes: ['id', 'first_name', 'last_name', 'role'],
        required: false
      }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  // Enrich payments with pricing plan info and subscription data
  const latestAuditMap = await getLatestAuditMap('payment', payments.rows.map((p) => p.id));
  const enrichedPayments = await Promise.all(payments.rows.map(async (payment) => {
    const paymentData = payment.toJSON();
    let pricingPlanData = paymentData.pricing_plan || null;
    
    // If pricing_plan already came from the include association, use it directly
    // Otherwise fallback to metadata or price-matching
    if (!pricingPlanData && paymentData.metadata?.pricing_plan_id) {
      const pricingPlan = await ProgramPricingPlan.findByPk(paymentData.metadata.pricing_plan_id);
      if (pricingPlan) {
        pricingPlanData = pricingPlan;
        paymentData.pricing_plan = {
          id: pricingPlan.id,
          name: pricingPlan.name,
          name_ar: pricingPlan.name_ar,
          duration_months: pricingPlan.duration_months,
          price: pricingPlan.price
        };
      }
    }
    
    // If no pricing plan from metadata, try to match by amount and program
    if (!pricingPlanData && paymentData.player?.program_id) {
      const paymentAmount = parseFloat(paymentData.total_amount || paymentData.amount || 0);
      // Try exact match first
      let matchingPlan = await ProgramPricingPlan.findOne({
        where: {
          program_id: paymentData.player.program_id,
          price: paymentAmount,
          is_active: true
        }
      });
      
      // If no exact match, try with small tolerance for decimal differences
      if (!matchingPlan) {
        const plans = await ProgramPricingPlan.findAll({
          where: {
            program_id: paymentData.player.program_id,
            is_active: true
          }
        });
        matchingPlan = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
      }
      
      if (matchingPlan) {
        pricingPlanData = matchingPlan;
        paymentData.pricing_plan = {
          id: matchingPlan.id,
          name: matchingPlan.name,
          name_ar: matchingPlan.name_ar,
          duration_months: matchingPlan.duration_months,
          price: matchingPlan.price
        };
      }
    }
    
    // Also try to match from metadata program_id if player has no program
    if (!pricingPlanData && paymentData.metadata?.program_id) {
      const paymentAmount = parseFloat(paymentData.total_amount || paymentData.amount || 0);
      const plans = await ProgramPricingPlan.findAll({
        where: {
          program_id: paymentData.metadata.program_id,
          is_active: true
        }
      });
      const matchingPlan = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
      
      if (matchingPlan) {
        pricingPlanData = matchingPlan;
        paymentData.pricing_plan = {
          id: matchingPlan.id,
          name: matchingPlan.name,
          name_ar: matchingPlan.name_ar,
          duration_months: matchingPlan.duration_months,
          price: matchingPlan.price
        };
      }
    }
    
    // Last resort: try to match by price across ALL pricing plans in the same branch
    if (!pricingPlanData && paymentData.branch_id) {
      const paymentAmount = parseFloat(paymentData.total_amount || paymentData.amount || 0);
      const plans = await ProgramPricingPlan.findAll({
        where: { is_active: true },
        include: [{
          model: Program,
          as: 'program',
          where: { branch_id: paymentData.branch_id },
          required: true
        }]
      });
      const matchingPlan = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
      
      if (matchingPlan) {
        pricingPlanData = matchingPlan;
        paymentData.pricing_plan = {
          id: matchingPlan.id,
          name: matchingPlan.name,
          name_ar: matchingPlan.name_ar,
          duration_months: matchingPlan.duration_months,
          price: matchingPlan.price
        };
      }
    }
    
    // If no subscription linked, try to find one for this player
    let subscriptionData = paymentData.subscription;
    if (!subscriptionData && paymentData.player_id) {
      const playerSubscription = await Subscription.findOne({
        where: { 
          player_id: paymentData.player_id,
          status: { [Op.in]: ['active', 'pending'] }
        },
        order: [['created_at', 'DESC']],
        attributes: ['id', 'plan_type', 'start_date', 'end_date', 'status', 'notes']
      });
      if (playerSubscription) {
        subscriptionData = playerSubscription.toJSON();
        paymentData.subscription = subscriptionData;
        
        // Try to extract plan name from subscription notes (format: "Plan: {name} ({duration} months)")
        if (subscriptionData.notes) {
          const planMatch = subscriptionData.notes.match(/Plan: (.+?) \(/);
          if (planMatch) {
            paymentData.plan_name = planMatch[1];
          }
        }
      }
    }
    
    // Calculate days remaining based on pricing plan duration or subscription
    const durationMonths = pricingPlanData?.duration_months || paymentData.metadata?.duration_months || null;
    
    if (subscriptionData?.end_date) {
      const endDate = new Date(subscriptionData.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = endDate - today;
      paymentData.days_remaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      paymentData.duration_months = durationMonths;
    } else if (paymentData.status === 'completed' && (paymentData.paid_at || paymentData.created_at) && durationMonths) {
      // Only calculate days if we have a valid duration from pricing plan
      const paymentDate = new Date(paymentData.paid_at || paymentData.created_at);
      const estimatedEndDate = new Date(paymentDate);
      estimatedEndDate.setMonth(estimatedEndDate.getMonth() + durationMonths);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = estimatedEndDate - today;
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      paymentData.days_remaining = Math.max(0, daysLeft);
      paymentData.duration_months = durationMonths;
    }
    // If no pricing plan found, don't show days (will be null/undefined)
    
    const latestAudit = latestAuditMap[paymentData.id];
    const actor = latestAudit?.actor || paymentData.processor;
    paymentData.last_updated_by = actor
      ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
      : null;
    paymentData.last_updated_at = latestAudit?.created_at || paymentData.updated_at || paymentData.created_at;

    return paymentData;
  }));

  payments.rows = enrichedPayments;

  const response = formatPaginationResponse(payments, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get payment by ID
 * @route   GET /api/payments/:id
 * @access  Private
 */
exports.getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPk(req.params.id, {
    include: [
      { association: 'user', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] },
      { association: 'player' },
      { association: 'subscription' },
      { association: 'branch' },
      { association: 'processor', attributes: ['id', 'first_name', 'last_name'] }
    ]
  });

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  // Check access for parents
  if (req.user.role === ROLES.PARENT && payment.user_id !== req.user.id) {
    throw new AppError('Not authorized to view this payment', 403);
  }

  const latestAuditMap = await getLatestAuditMap('payment', [payment.id]);
  const latestAudit = latestAuditMap[payment.id];
  const paymentData = payment.toJSON();
  const actor = latestAudit?.actor || paymentData.processor;
  paymentData.last_updated_by = actor
    ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
    : null;
  paymentData.last_updated_at = latestAudit?.created_at || paymentData.updated_at || paymentData.created_at;

  res.json({
    success: true,
    data: paymentData
  });
});

/**
 * @desc    Create new payment
 * @route   POST /api/payments
 * @access  Private/Admin
 */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    user_id, player_id, subscription_id, branch_id, type,
    description, amount, tax_amount = 0, discount_amount = 0,
    payment_method, due_date, notes, pricing_plan_id, metadata, status
  } = req.body;

  // Calculate total
  const total_amount = parseFloat(amount) + parseFloat(tax_amount) - parseFloat(discount_amount);

  // Determine user_id (for parent creating payment)
  const payerId = user_id || req.user.id;

  const paymentStatus = status || PAYMENT_STATUS.PENDING;

  const payment = await Payment.create({
    user_id: payerId,
    player_id,
    subscription_id,
    branch_id: branch_id || req.user.branch_id,
    type: type || 'subscription',
    description,
    amount,
    tax_amount,
    discount_amount,
    total_amount,
    payment_method: payment_method || 'cash',
    status: paymentStatus,
    due_date,
    notes,
    pricing_plan_id: pricing_plan_id || null,
    metadata: metadata || null,
    processed_by: req.user.id
  });

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: payment.id,
    action: 'create',
    actor: req.user,
    before: null,
    after: payment
  });

  // Create subscription if pricing plan is provided and payment is completed
  if (pricing_plan_id && paymentStatus === PAYMENT_STATUS.COMPLETED) {
    const pricingPlan = await ProgramPricingPlan.findByPk(pricing_plan_id);
    if (pricingPlan && player_id) {
      await createSubscriptionFromPayment({
        payment: { ...payment.toJSON(), player_id },
        pricingPlan,
        notes: `Auto-created from payment ${payment.invoice_number || payment.id}. Plan: ${pricingPlan.name} (${pricingPlan.duration_months} months)`
      });
    }
  }

  res.status(201).json({
    success: true,
    message: 'Payment created successfully',
    data: payment
  });
});

/**
 * @desc    Create payment with receipt upload (Parent)
 * @route   POST /api/payments/receipt
 * @access  Private/Parent
 */
exports.createReceiptPayment = asyncHandler(async (req, res) => {
  const { player_id, program_id, amount, description, discount_amount, discount_id, pricing_plan_id } = req.body;

  if (!req.file) {
    throw new AppError('Receipt file is required', 400);
  }

  const player = await Player.findByPk(player_id);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to create payment for this player', 403);
  }

  let program = null;
  if (program_id) {
    program = await Program.findByPk(program_id);
  }

  // Frontend sends the already-discounted price as 'amount' (e.g., plan=600, discount=200, amount=400)
  const finalAmount = parseFloat(amount) || parseFloat(program?.price_monthly) || 0;
  const discAmount = parseFloat(discount_amount) || 0;
  // Original price = what the parent pays + discount
  const originalAmount = finalAmount + discAmount;
  // Total amount = what the parent actually pays (already discounted)
  const total_amount = finalAmount;
  const receiptUrl = `/uploads/documents/${req.file.filename}`;

  const payment = await Payment.create({
    user_id: req.user.id,
    player_id,
    branch_id: player.branch_id,
    type: 'subscription',
    description: description || (program ? `Program enrollment: ${program.name}` : 'Program enrollment'),
    amount: originalAmount,
    tax_amount: 0,
    discount_amount: discAmount,
    total_amount,
    payment_method: 'bank_transfer',
    status: PAYMENT_STATUS.PENDING,
    pricing_plan_id: pricing_plan_id || null,
    receipt_url: receiptUrl,
    processed_by: req.user.id,
    metadata: {
      program_id: program_id || null,
      discount_id: discount_id || null
    }
  });

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: payment.id,
    action: 'create',
    actor: req.user,
    before: null,
    after: payment
  });

  // Mark discount as used
  if (discount_id) {
    try {
      const { Discount } = require('../models');
      const discount = await Discount.findByPk(discount_id);
      if (discount && discount.status === 'active') {
        await discount.update({
          status: 'used',
          used_at: new Date(),
          payment_id: payment.id
        });
      }
    } catch (discErr) {
      console.error('Error marking discount as used:', discErr);
    }
  }

  await NotificationService.notifySuperAdmins({
    type: 'payment_received',
    title: `Receipt submitted: ${total_amount} SAR`,
    titleAr: `تم رفع إيصال: ${total_amount} ريال`,
    message: `Receipt submitted for ${player.first_name} ${player.last_name}`,
    messageAr: `تم رفع إيصال لـ ${player.first_name_ar || player.first_name} ${player.last_name_ar || player.last_name}`,
    data: { payment_id: payment.id, player_id: player.id, amount: total_amount }
  });

  await NotificationService.notifyAccountants({
    type: 'payment_received',
    title: `Receipt submitted: ${total_amount} SAR`,
    titleAr: `تم رفع إيصال: ${total_amount} ريال`,
    message: `Receipt submitted for ${player.first_name} ${player.last_name}`,
    messageAr: `تم رفع إيصال لـ ${player.first_name_ar || player.first_name} ${player.last_name_ar || player.last_name}`,
    data: { payment_id: payment.id, player_id: player.id, amount: total_amount }
  });

  res.status(201).json({
    success: true,
    message: 'Receipt submitted successfully',
    data: payment
  });
});

/**
 * @desc    Create payment with receipt upload (Admin/Accountant)
 * @route   POST /api/payments/admin/receipt
 * @access  Private/Admin/Accountant
 */
exports.createAdminReceiptPayment = asyncHandler(async (req, res) => {
  const { player_id, program_id, amount, description, notes, payment_method, receipt_number, pricing_plan_id, status } = req.body;

  const player = await Player.findByPk(player_id);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  let program = null;
  if (program_id) {
    program = await Program.findByPk(program_id);
  }

  const baseAmount = amount || program?.price_monthly || 0;
  const total_amount = parseFloat(baseAmount);
  const receiptUrl = req.file ? `/uploads/documents/${req.file.filename}` : null;

  const paymentStatus = status || (receiptUrl ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COMPLETED);
  const method = payment_method || 'bank_transfer';

  const payment = await Payment.create({
    user_id: req.user.id,
    player_id,
    branch_id: player.branch_id,
    type: 'subscription',
    description: description || (program ? `Program enrollment: ${program.name}` : 'Manual payment'),
    notes: notes || null,
    amount: baseAmount,
    tax_amount: 0,
    discount_amount: 0,
    total_amount,
    payment_method: method,
    status: paymentStatus,
    receipt_url: receiptUrl,
    pricing_plan_id: pricing_plan_id || null,
    metadata: {
      program_id: program_id || null,
      receiptNumber: receipt_number || null,
      created_by: req.user.id,
      created_by_role: req.user.role
    }
  });

  // Create subscription if pricing plan is provided
  if (pricing_plan_id && paymentStatus === PAYMENT_STATUS.COMPLETED) {
    const pricingPlan = await ProgramPricingPlan.findByPk(pricing_plan_id);
    if (pricingPlan) {
      await createSubscriptionFromPayment({
        payment: { ...payment.toJSON(), player_id },
        pricingPlan,
        programIdOverride: pricingPlan.program_id || program_id,
        notes: `Auto-created from payment ${payment.invoice_number || payment.id}. Plan: ${pricingPlan.name} (${pricingPlan.duration_months} months)`
      });
    }
  }

  res.status(201).json({
    success: true,
    message: 'Payment created successfully',
    data: payment
  });
});

/**
 * @desc    Update payment
 * @route   PUT /api/payments/:id
 * @access  Private/Admin
 */
exports.updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPk(req.params.id);

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  const updates = { ...req.body };

  if (updates.amount !== undefined || updates.tax_amount !== undefined || updates.discount_amount !== undefined) {
    const amount = parseFloat(updates.amount ?? payment.amount);
    const taxAmount = parseFloat(updates.tax_amount ?? payment.tax_amount ?? 0);
    const discountAmount = parseFloat(updates.discount_amount ?? payment.discount_amount ?? 0);
    updates.total_amount = amount + taxAmount - discountAmount;
  }

  const beforeData = payment.toJSON();
  updates.processed_by = req.user.id;
  await payment.update(updates);

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: payment.id,
    action: 'update',
    actor: req.user,
    before: beforeData,
    after: payment
  });

  res.json({
    success: true,
    message: 'Payment updated successfully',
    data: payment
  });
});

/**
 * @desc    Delete payment
 * @route   DELETE /api/payments/:id
 * @access  Private/Admin
 */
exports.deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPk(req.params.id);

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  const beforeData = payment.toJSON();
  await payment.destroy();

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: req.params.id,
    action: 'delete',
    actor: req.user,
    before: beforeData,
    after: null
  });

  res.json({
    success: true,
    message: 'Payment deleted successfully'
  });
});

/**
 * @desc    Get payments by user
 * @route   GET /api/payments/user/:userId
 * @access  Private
 */
exports.getPaymentsByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check access
  if (req.user.role === ROLES.PARENT && req.user.id !== userId) {
    throw new AppError('Not authorized to view these payments', 403);
  }

  const payments = await Payment.findAll({
    where: { user_id: userId },
    include: [
      { 
        association: 'player', 
        attributes: ['id', 'first_name', 'last_name', 'program_id'],
        include: [{ association: 'program', attributes: ['id', 'name', 'name_ar'], required: false }]
      },
      { association: 'subscription', attributes: ['id', 'start_date', 'end_date', 'status'], required: false },
      { association: 'pricing_plan', attributes: ['id', 'name', 'name_ar', 'duration_months', 'price'], required: false }
    ],
    order: [['created_at', 'DESC']]
  });

  // Enrich payments with pricing plan info
  const enrichedPayments = await Promise.all(payments.map(async (payment) => {
    const paymentData = payment.toJSON();
    
    // Ensure date is properly formatted
    paymentData.payment_date = paymentData.paid_at || paymentData.created_at;
    
    let pricingPlanFound = paymentData.pricing_plan || null;
    
    // Fallback: try metadata
    if (!pricingPlanFound && paymentData.metadata?.pricing_plan_id) {
      const pricingPlan = await ProgramPricingPlan.findByPk(paymentData.metadata.pricing_plan_id);
      if (pricingPlan) pricingPlanFound = pricingPlan;
    }
    
    // Fallback: try to match by player's program and amount
    if (!pricingPlanFound && paymentData.player?.program_id) {
      const paymentAmount = parseFloat(paymentData.total_amount || paymentData.amount || 0);
      const plans = await ProgramPricingPlan.findAll({
        where: { program_id: paymentData.player.program_id, is_active: true }
      });
      pricingPlanFound = plans.find(p => Math.abs(parseFloat(p.price) - paymentAmount) < 1);
    }
    
    if (pricingPlanFound && !paymentData.pricing_plan) {
      paymentData.pricing_plan = {
        id: pricingPlanFound.id,
        name: pricingPlanFound.name,
        duration_months: pricingPlanFound.duration_months
      };
    }
    
    return paymentData;
  }));

  res.json({
    success: true,
    data: enrichedPayments
  });
});

/**
 * @desc    Get payments by player
 * @route   GET /api/payments/player/:playerId
 * @access  Private
 */
exports.getPaymentsByPlayer = asyncHandler(async (req, res) => {
  const { playerId } = req.params;

  const player = await Player.findByPk(playerId);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to view these payments', 403);
  }

  const payments = await Payment.findAll({
    where: { player_id: playerId },
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: payments
  });
});

/**
 * @desc    Get payments by branch
 * @route   GET /api/payments/branch/:branchId
 * @access  Private/Admin
 */
exports.getPaymentsByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { page = 1, limit = 20, status } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = { branch_id: branchId };
  if (status) where.status = status;

  const payments = await Payment.findAndCountAll({
    where,
    include: [
      { association: 'user', attributes: ['id', 'first_name', 'last_name'] },
      { association: 'player', attributes: ['id', 'first_name', 'last_name'] }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(payments, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Process refund
 * @route   POST /api/payments/:id/refund
 * @access  Private/Admin
 */
exports.processRefund = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const payment = await Payment.findByPk(req.params.id);

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  if (payment.status !== PAYMENT_STATUS.COMPLETED) {
    throw new AppError('Only completed payments can be refunded', 400);
  }

  await payment.update({
    status: PAYMENT_STATUS.REFUNDED,
    processed_by: req.user.id,
    notes: `${payment.notes || ''}\nRefund reason: ${reason}\nRefunded by: ${req.user.first_name} ${req.user.last_name}`
  });

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: payment.id,
    action: 'update',
    actor: req.user,
    before: null,
    after: payment,
    metadata: { reason }
  });

  res.json({
    success: true,
    message: 'Refund processed successfully',
    data: payment
  });
});

/**
 * @desc    Mark payment as completed
 * @route   PATCH /api/payments/:id/complete
 * @access  Private/Admin
 */
exports.markAsCompleted = asyncHandler(async (req, res) => {
  const { transaction_id } = req.body;

  const payment = await Payment.findByPk(req.params.id);

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  await payment.update({
    status: PAYMENT_STATUS.COMPLETED,
    paid_at: new Date(),
    transaction_id,
    processed_by: req.user.id
  });

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: payment.id,
    action: 'update',
    actor: req.user,
    before: null,
    after: payment,
    metadata: { transition: 'completed' }
  });

  const paymentPlayer = payment.player_id ? await Player.findByPk(payment.player_id) : null;
  const amount = payment.total_amount || payment.amount || 0;

  if ([ROLES.SUPER_ADMIN, ROLES.OWNER].includes(req.user.role)) {
    await NotificationService.notifyAccountants({
      type: 'payment_received',
      title: `Payment approved: ${amount} SAR`,
      titleAr: `تم اعتماد دفعة: ${amount} ريال`,
      message: `Approved by Super Admin${paymentPlayer ? ` for ${paymentPlayer.first_name} ${paymentPlayer.last_name}` : ''}`,
      messageAr: `تم الاعتماد بواسطة الإدارة العليا${paymentPlayer ? ` لـ ${paymentPlayer.first_name_ar || paymentPlayer.first_name} ${paymentPlayer.last_name_ar || paymentPlayer.last_name}` : ''}`,
      data: { payment_id: payment.id, player_id: paymentPlayer?.id, amount }
    });
  } else if (req.user.role === ROLES.ACCOUNTANT) {
    await NotificationService.notifySuperAdmins({
      type: 'payment_received',
      title: `Payment approved: ${amount} SAR`,
      titleAr: `تم اعتماد دفعة: ${amount} ريال`,
      message: `Approved by Accountant${paymentPlayer ? ` for ${paymentPlayer.first_name} ${paymentPlayer.last_name}` : ''}`,
      messageAr: `تم الاعتماد بواسطة المحاسب${paymentPlayer ? ` لـ ${paymentPlayer.first_name_ar || paymentPlayer.first_name} ${paymentPlayer.last_name_ar || paymentPlayer.last_name}` : ''}`,
      data: { payment_id: payment.id, player_id: paymentPlayer?.id, amount }
    });
  }

  // If subscription payment, activate subscription
  if (payment.subscription_id) {
    await Subscription.update(
      { status: 'active' },
      { where: { id: payment.subscription_id } }
    );
  } else if (payment.player_id && (payment.pricing_plan_id || payment.metadata?.pricing_plan_id)) {
    // Auto-create subscription from receipt payment when no subscription exists
    try {
      const planId = payment.pricing_plan_id || payment.metadata.pricing_plan_id;
      const pricingPlan = await ProgramPricingPlan.findByPk(planId);
      
      if (pricingPlan) {
        const programId = payment.metadata?.program_id || pricingPlan.program_id;
        const subscription = await createSubscriptionFromPayment({
          payment: payment.toJSON(),
          pricingPlan,
          programIdOverride: programId,
          notes: `Auto-created from payment ${payment.invoice_number || payment.id}. Plan: ${pricingPlan.name} (${pricingPlan.duration_months} months)`
        });

        await payment.update({ subscription_id: subscription.id });
      }
    } catch (subErr) {
      console.error('Error auto-creating subscription from payment:', subErr);
    }
  }

  res.json({
    success: true,
    message: 'Payment marked as completed',
    data: payment
  });
});

/**
 * @desc    Cancel payment
 * @route   PATCH /api/payments/:id/cancel
 * @access  Private/Admin
 */
exports.cancelPayment = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const payment = await Payment.findByPk(req.params.id);

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  if (payment.status === PAYMENT_STATUS.COMPLETED) {
    throw new AppError('Cannot cancel completed payments. Use refund instead.', 400);
  }

  await payment.update({
    status: PAYMENT_STATUS.CANCELLED,
    processed_by: req.user.id,
    notes: `${payment.notes || ''}\nCancellation reason: ${reason}`
  });

  await logAuditEvent({
    module: 'payments',
    entityType: 'payment',
    entityId: payment.id,
    action: 'update',
    actor: req.user,
    before: null,
    after: payment,
    metadata: { reason }
  });

  res.json({
    success: true,
    message: 'Payment cancelled successfully',
    data: payment
  });
});

/**
 * @desc    Get pending payments
 * @route   GET /api/payments/status/pending
 * @access  Private/Admin
 */
exports.getPendingPayments = asyncHandler(async (req, res) => {
  const where = { status: PAYMENT_STATUS.PENDING };

  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  const payments = await Payment.findAll({
    where,
    include: [
      { association: 'user', attributes: ['id', 'first_name', 'last_name', 'phone'] },
      { association: 'player', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['due_date', 'ASC'], ['created_at', 'ASC']]
  });

  res.json({
    success: true,
    data: payments
  });
});

/**
 * @desc    Generate invoice
 * @route   GET /api/payments/:id/invoice
 * @access  Private
 */
exports.generateInvoice = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPk(req.params.id, {
    include: [
      { association: 'user' },
      { association: 'player' },
      { association: 'branch' }
    ]
  });

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  // Check access
  if (req.user.role === ROLES.PARENT && payment.user_id !== req.user.id) {
    throw new AppError('Not authorized', 403);
  }

  // Return invoice data (in production, you'd generate PDF)
  res.json({
    success: true,
    data: {
      invoice_number: payment.invoice_number,
      date: payment.created_at,
      due_date: payment.due_date,
      status: payment.status,
      customer: {
        name: `${payment.user.first_name} ${payment.user.last_name}`,
        email: payment.user.email,
        phone: payment.user.phone
      },
      player: payment.player ? {
        name: `${payment.player.first_name} ${payment.player.last_name}`,
        registration_number: payment.player.registration_number
      } : null,
      branch: payment.branch ? {
        name: payment.branch.name,
        address: payment.branch.address
      } : null,
      items: [{
        description: payment.description || payment.type,
        amount: payment.amount
      }],
      subtotal: payment.amount,
      tax: payment.tax_amount,
      discount: payment.discount_amount,
      total: payment.total_amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      paid_at: payment.paid_at
    }
  });
});

/**
 * @desc    Get payment statistics
 * @route   GET /api/payments/stats
 * @access  Private/Admin
 */
exports.getPaymentStats = asyncHandler(async (req, res) => {
  const { branch_id, start_date, end_date } = req.query;
  const where = {};

  if (branch_id) where.branch_id = branch_id;
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  if (start_date && end_date) {
    where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
  }

  const [totalRevenue, pendingAmount, byStatus, byMethod] = await Promise.all([
    Payment.sum('total_amount', { where: { ...where, status: PAYMENT_STATUS.COMPLETED } }),
    Payment.sum('total_amount', { where: { ...where, status: PAYMENT_STATUS.PENDING } }),
    Payment.findAll({
      where,
      attributes: ['status', [require('sequelize').fn('COUNT', 'id'), 'count'], [require('sequelize').fn('SUM', require('sequelize').col('total_amount')), 'total']],
      group: ['status']
    }),
    Payment.findAll({
      where: { ...where, status: PAYMENT_STATUS.COMPLETED },
      attributes: ['payment_method', [require('sequelize').fn('COUNT', 'id'), 'count'], [require('sequelize').fn('SUM', require('sequelize').col('total_amount')), 'total']],
      group: ['payment_method']
    })
  ]);

  res.json({
    success: true,
    data: {
      totalRevenue: totalRevenue || 0,
      pendingAmount: pendingAmount || 0,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = { count: parseInt(item.get('count')), total: parseFloat(item.get('total')) || 0 };
        return acc;
      }, {}),
      byMethod: byMethod.reduce((acc, item) => {
        acc[item.payment_method] = { count: parseInt(item.get('count')), total: parseFloat(item.get('total')) || 0 };
        return acc;
      }, {})
    }
  });
});

/**
 * @desc    Get revenue report
 * @route   GET /api/payments/revenue
 * @access  Private/Admin
 */
exports.getRevenueReport = asyncHandler(async (req, res) => {
  const { period = 'monthly', year = new Date().getFullYear() } = req.query;
  const where = { status: PAYMENT_STATUS.COMPLETED };

  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  // Get revenue grouped by month
  const revenue = await Payment.findAll({
    where: {
      ...where,
      paid_at: {
        [Op.between]: [new Date(`${year}-01-01`), new Date(`${year}-12-31`)]
      }
    },
    attributes: [
      [require('sequelize').fn('MONTH', require('sequelize').col('paid_at')), 'month'],
      [require('sequelize').fn('SUM', require('sequelize').col('total_amount')), 'revenue'],
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'transactions']
    ],
    group: [require('sequelize').fn('MONTH', require('sequelize').col('paid_at'))],
    order: [[require('sequelize').fn('MONTH', require('sequelize').col('paid_at')), 'ASC']]
  });

  res.json({
    success: true,
    data: {
      year: parseInt(year),
      period,
      revenue: revenue.map(r => ({
        month: r.get('month'),
        revenue: parseFloat(r.get('revenue')) || 0,
        transactions: parseInt(r.get('transactions'))
      }))
    }
  });
});

/**
 * @desc    Get payment gateway configuration for frontend
 * @route   GET /api/payments/gateway/config
 * @access  Public (publishable keys only)
 */
exports.getGatewayConfig = asyncHandler(async (req, res) => {
  const config = paymentService.getFrontendConfig();
  
  res.json({
    success: true,
    data: config
  });
});

/**
 * @desc    Initiate online payment (creates payment session)
 * @route   POST /api/payments/gateway/initiate
 * @access  Private/Parent
 */
exports.initiateOnlinePayment = asyncHandler(async (req, res) => {
  const { player_id, pricing_plan_id, description, discount_id } = req.body;

  // Validate player
  const player = await Player.findByPk(player_id, {
    include: [{ association: 'branch' }]
  });
  
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check authorization
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to make payment for this player', 403);
  }

  // Get pricing plan
  const pricingPlan = await ProgramPricingPlan.findByPk(pricing_plan_id, {
    include: [{ association: 'program' }]
  });
  
  if (!pricingPlan) {
    throw new AppError('Pricing plan not found', 404);
  }

  // Calculate amount (in halalas for consistency)
  let amount = Math.round(parseFloat(pricingPlan.price) * 100);
  let discountAmount = 0;

  // Apply discount if provided
  if (discount_id) {
    try {
      const { Discount } = require('../models');
      const discount = await Discount.findByPk(discount_id);
      if (discount && discount.status === 'active') {
        if (discount.discount_type === 'percentage') {
          discountAmount = Math.round(amount * (discount.discount_value / 100));
        } else {
          discountAmount = Math.round(discount.discount_value * 100);
        }
        amount = amount - discountAmount;
      }
    } catch (discErr) {
      console.error('Error applying discount:', discErr);
    }
  }

  // Create pending payment record in database
  const paymentRecord = await Payment.create({
    user_id: req.user.id,
    player_id,
    branch_id: player.branch_id,
    type: 'subscription',
    description: description || `${pricingPlan.program?.name || 'Program'} - ${pricingPlan.name}`,
    amount: amount / 100, // Store in SAR
    tax_amount: 0,
    discount_amount: discountAmount / 100,
    total_amount: amount / 100,
    payment_method: 'online',
    status: PAYMENT_STATUS.PENDING,
    pricing_plan_id,
    metadata: {
      program_id: pricingPlan.program_id,
      discount_id: discount_id || null,
      gateway_provider: paymentService.provider
    }
  });

  // Create payment session with gateway
  try {
    const gatewayPayment = await paymentService.createPayment({
      amount: amount, // In halalas
      currency: 'SAR',
      description: paymentRecord.description,
      metadata: {
        payment_id: paymentRecord.id,
        player_id: player_id,
        user_id: req.user.id,
        pricing_plan_id: pricing_plan_id
      },
      callbackUrl: `${process.env.PAYMENT_CALLBACK_URL}?payment_id=${paymentRecord.id}`
    });

    // Update payment record with gateway info
    await paymentRecord.update({
      transaction_id: gatewayPayment.id,
      metadata: {
        ...paymentRecord.metadata,
        gateway_payment_id: gatewayPayment.id
      }
    });

    res.json({
      success: true,
      message: 'Payment initiated',
      data: {
        payment_id: paymentRecord.id,
        gateway_payment_id: gatewayPayment.id,
        redirect_url: gatewayPayment.redirectUrl,
        amount: amount / 100,
        currency: 'SAR',
        provider: paymentService.provider
      }
    });
  } catch (gatewayError) {
    // Mark payment as failed
    await paymentRecord.update({
      status: PAYMENT_STATUS.FAILED,
      notes: `Gateway error: ${gatewayError.message}`
    });
    
    throw new AppError(`Payment gateway error: ${gatewayError.message}`, 500);
  }
});

/**
 * @desc    Handle payment callback from gateway
 * @route   GET /api/payments/gateway/callback
 * @access  Public (redirected from gateway)
 */
exports.handleGatewayCallback = asyncHandler(async (req, res) => {
  const { payment_id, id: gateway_payment_id, status: gateway_status } = req.query;

  if (!payment_id) {
    return res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=error&message=Missing payment ID`);
  }

  const payment = await Payment.findByPk(payment_id, {
    include: [
      { association: 'player' },
      { association: 'pricing_plan', include: [{ association: 'program' }] }
    ]
  });

  if (!payment) {
    return res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=error&message=Payment not found`);
  }

  try {
    // Verify payment status with gateway
    const gatewayPaymentId = gateway_payment_id || payment.transaction_id || payment.metadata?.gateway_payment_id;
    const gatewayPayment = await paymentService.getPayment(gatewayPaymentId);

    if (gatewayPayment.status === 'completed') {
      // Payment successful
      await payment.update({
        status: PAYMENT_STATUS.COMPLETED,
        paid_at: new Date(),
        payment_method: `online_${gatewayPayment.source?.type || 'card'}`,
        notes: `Paid via ${paymentService.provider} - ${gatewayPayment.source?.company || 'Card'} ****${gatewayPayment.source?.lastFour || '****'}`
      });

      // Create subscription
      if (payment.pricing_plan_id && payment.player_id) {
        const pricingPlan = payment.pricing_plan || await ProgramPricingPlan.findByPk(payment.pricing_plan_id);
        
        if (pricingPlan) {
          const subscription = await createSubscriptionFromPayment({
            payment: payment.toJSON(),
            pricingPlan,
            notes: `Online payment - ${pricingPlan.name} (${pricingPlan.duration_months} months)`
          });

          await payment.update({ subscription_id: subscription.id });
        }
      }

      // Mark discount as used
      if (payment.metadata?.discount_id) {
        try {
          const { Discount } = require('../models');
          await Discount.update(
            { status: 'used', used_at: new Date(), payment_id: payment.id },
            { where: { id: payment.metadata.discount_id } }
          );
        } catch (discErr) {
          console.error('Error marking discount as used:', discErr);
        }
      }

      // Send notifications
      await NotificationService.notifyAccountants({
        type: 'payment_received',
        title: `Online payment received: ${payment.total_amount} SAR`,
        titleAr: `تم استلام دفعة إلكترونية: ${payment.total_amount} ريال`,
        message: `Payment from ${payment.player?.first_name} ${payment.player?.last_name} via ${paymentService.provider}`,
        messageAr: `دفعة من ${payment.player?.first_name_ar || payment.player?.first_name} عبر ${paymentService.provider}`,
        data: { payment_id: payment.id, amount: payment.total_amount }
      });

      return res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=success&payment_id=${payment.id}`);
    } else if (gatewayPayment.status === 'failed') {
      await payment.update({
        status: PAYMENT_STATUS.FAILED,
        notes: `Payment failed: ${gatewayPayment.raw?.message || 'Unknown error'}`
      });

      return res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=failed&payment_id=${payment.id}`);
    } else {
      return res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=pending&payment_id=${payment.id}`);
    }
  } catch (error) {
    console.error('Gateway callback error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=error&message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * @desc    Handle payment webhook from gateway
 * @route   POST /api/payments/gateway/webhook
 * @access  Public (from gateway)
 */
exports.handleGatewayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-signature'] || req.headers['x-moyasar-signature'] || req.headers['x-tap-signature'];
  
  // Verify webhook signature
  if (!paymentService.verifyWebhook(req.body, signature)) {
    console.warn('[Payment Webhook] Invalid signature');
    return res.status(401).json({ success: false, message: 'Invalid signature' });
  }

  const { id: gateway_payment_id, status, metadata } = req.body;
  const paymentId = metadata?.payment_id;

  if (!paymentId) {
    console.warn('[Payment Webhook] No payment_id in metadata');
    return res.status(200).json({ success: true, message: 'No payment_id' });
  }

  const payment = await Payment.findByPk(paymentId);
  if (!payment) {
    console.warn(`[Payment Webhook] Payment not found: ${paymentId}`);
    return res.status(200).json({ success: true, message: 'Payment not found' });
  }

  // Update payment status based on webhook
  const normalizedStatus = paymentService.provider === 'moyasar' 
    ? paymentService._normalizeMoyasarStatus(status)
    : paymentService._normalizeTapStatus(status);

  if (normalizedStatus === 'completed' && payment.status !== PAYMENT_STATUS.COMPLETED) {
    await payment.update({
      status: PAYMENT_STATUS.COMPLETED,
      paid_at: new Date()
    });

    // Create subscription if needed
    if (payment.pricing_plan_id && payment.player_id && !payment.subscription_id) {
      const pricingPlan = await ProgramPricingPlan.findByPk(payment.pricing_plan_id);
      if (pricingPlan) {
        const subscription = await createSubscriptionFromPayment({
          payment: payment.toJSON(),
          pricingPlan
        });

        await payment.update({ subscription_id: subscription.id });
      }
    }
  } else if (normalizedStatus === 'failed') {
    await payment.update({ status: PAYMENT_STATUS.FAILED });
  } else if (normalizedStatus === 'refunded') {
    await payment.update({ status: PAYMENT_STATUS.REFUNDED });
  }

  res.status(200).json({ success: true, message: 'Webhook processed' });
});

/**
 * @desc    Verify payment status with gateway
 * @route   GET /api/payments/gateway/verify/:paymentId
 * @access  Private
 */
exports.verifyGatewayPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await Payment.findByPk(paymentId);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  // Check authorization
  if (req.user.role === ROLES.PARENT && payment.user_id !== req.user.id) {
    throw new AppError('Not authorized to view this payment', 403);
  }

  const gatewayPaymentId = payment.transaction_id || payment.metadata?.gateway_payment_id;
  
  if (!gatewayPaymentId) {
    return res.json({
      success: true,
      data: {
        payment_id: payment.id,
        status: payment.status,
        verified: false,
        message: 'No gateway payment ID found'
      }
    });
  }

  try {
    const gatewayPayment = await paymentService.getPayment(gatewayPaymentId);

    res.json({
      success: true,
      data: {
        payment_id: payment.id,
        gateway_payment_id: gatewayPaymentId,
        local_status: payment.status,
        gateway_status: gatewayPayment.status,
        verified: true,
        amount: gatewayPayment.amount / 100,
        currency: gatewayPayment.currency,
        source: gatewayPayment.source,
        provider: paymentService.provider
      }
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        payment_id: payment.id,
        status: payment.status,
        verified: false,
        message: error.message
      }
    });
  }
});

/**
 * @desc    Process online refund via gateway
 * @route   POST /api/payments/gateway/:paymentId/refund
 * @access  Private/Admin
 */
exports.processGatewayRefund = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { amount, reason } = req.body;

  const payment = await Payment.findByPk(paymentId);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  if (payment.status !== PAYMENT_STATUS.COMPLETED) {
    throw new AppError('Only completed payments can be refunded', 400);
  }

  const gatewayPaymentId = payment.transaction_id || payment.metadata?.gateway_payment_id;
  
  if (!gatewayPaymentId) {
    throw new AppError('No gateway payment ID found - cannot process online refund', 400);
  }

  try {
    const refundAmount = amount ? Math.round(amount * 100) : null;
    const refundResult = await paymentService.refund(gatewayPaymentId, refundAmount);

    await payment.update({
      status: PAYMENT_STATUS.REFUNDED,
      notes: `${payment.notes || ''}\nRefund via ${paymentService.provider}: ${reason || 'No reason provided'}\nRefund ID: ${refundResult.refundId}`
    });

    // Cancel subscription if exists
    if (payment.subscription_id) {
      await Subscription.update(
        { status: 'cancelled' },
        { where: { id: payment.subscription_id } }
      );
    }

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        payment_id: payment.id,
        refund_id: refundResult.refundId,
        refund_amount: refundResult.amount / 100,
        status: 'refunded'
      }
    });
  } catch (error) {
    throw new AppError(`Refund failed: ${error.message}`, 500);
  }
});

/**
 * @desc    Complete mock payment (development only)
 * @route   POST /api/payments/gateway/mock/:paymentId/complete
 * @access  Private (development only)
 */
exports.completeMockPayment = asyncHandler(async (req, res) => {
  if (process.env.PAYMENT_PROVIDER !== 'mock') {
    throw new AppError('This endpoint is only available in mock mode', 400);
  }

  const { paymentId } = req.params;
  const { success = true } = req.body;

  const payment = await Payment.findByPk(paymentId);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  const gatewayPaymentId = payment.transaction_id || payment.metadata?.gateway_payment_id;
  
  if (gatewayPaymentId) {
    await paymentService.completeMockPayment(gatewayPaymentId, success);
  }

  // Update local payment
  await payment.update({
    status: success ? PAYMENT_STATUS.COMPLETED : PAYMENT_STATUS.FAILED,
    paid_at: success ? new Date() : null,
    payment_method: 'online_mock'
  });

  // Create subscription if successful
  if (success && payment.pricing_plan_id && payment.player_id) {
    const pricingPlan = await ProgramPricingPlan.findByPk(payment.pricing_plan_id);
    if (pricingPlan) {
      const subscription = await createSubscriptionFromPayment({
        payment: payment.toJSON(),
        pricingPlan
      });

      await payment.update({ subscription_id: subscription.id });
    }
  }

  res.json({
    success: true,
    message: success ? 'Mock payment completed' : 'Mock payment failed',
    data: payment
  });
});
