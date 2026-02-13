const { SMS, User, Player, Branch, Program, AutoSMSSettings } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse, formatPhoneNumber } = require('../utils/helpers');
const { ROLES, SMS_STATUS } = require('../config/constants');
const smsScheduler = require('../jobs/scheduler');

const BRANCH_SMS_ALLOWED_ROLES = [ROLES.COACH, ROLES.PARENT, 'player'];

async function getBranchAudienceRecipients(branchId, roles = BRANCH_SMS_ALLOWED_ROLES) {
  const requestedRoles = Array.isArray(roles) ? roles : [];
  const normalizedRoles = requestedRoles
    .map(r => String(r || '').toLowerCase())
    .filter(r => BRANCH_SMS_ALLOWED_ROLES.includes(r));

  if (normalizedRoles.length === 0) {
    throw new AppError('At least one target role is required (coach, parent, player)', 400);
  }

  const recipients = [];

  if (normalizedRoles.includes(ROLES.COACH)) {
    const coaches = await User.findAll({
      where: {
        role: ROLES.COACH,
        is_active: true,
        branch_id: branchId,
        phone: { [Op.ne]: null }
      },
      attributes: ['id', 'first_name', 'last_name', 'phone']
    });
    coaches.forEach(c => {
      recipients.push({
        user_id: c.id,
        phone: formatPhoneNumber(c.phone),
        name: `${c.first_name} ${c.last_name}`
      });
    });
  }

  if (normalizedRoles.includes(ROLES.PARENT)) {
    const players = await Player.findAll({
      where: { branch_id: branchId, status: 'active' },
      include: [{ association: 'parent', attributes: ['id', 'phone', 'first_name', 'last_name'] }]
    });
    const parentMap = new Map();
    players.forEach(player => {
      if (player.parent && player.parent.phone) {
        parentMap.set(player.parent.id, {
          user_id: player.parent.id,
          phone: formatPhoneNumber(player.parent.phone),
          name: `${player.parent.first_name} ${player.parent.last_name}`
        });
      }
    });
    recipients.push(...parentMap.values());
  }

  if (normalizedRoles.includes('player')) {
    const players = await Player.findAll({
      where: {
        branch_id: branchId,
        status: 'active',
        emergency_contact_phone: { [Op.ne]: null }
      },
      attributes: ['id', 'first_name', 'last_name', 'emergency_contact_phone']
    });
    players.forEach(p => {
      recipients.push({
        user_id: null,
        player_id: p.id,
        phone: formatPhoneNumber(p.emergency_contact_phone),
        name: `${p.first_name} ${p.last_name}`
      });
    });
  }

  // Deduplicate by phone so one person/player does not receive duplicate copies
  const uniqueByPhone = new Map();
  recipients.forEach(r => {
    if (r.phone) uniqueByPhone.set(r.phone, r);
  });

  return [...uniqueByPhone.values()];
}

async function getBranchAudienceRecipientsByUsers(branchId, selectedIds = []) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  if (ids.length === 0) {
    throw new AppError('No users selected', 400);
  }

  const recipients = [];

  const users = await User.findAll({
    where: {
      id: { [Op.in]: ids },
      branch_id: branchId,
      is_active: true,
      role: { [Op.in]: [ROLES.COACH, ROLES.PARENT] },
      phone: { [Op.ne]: null }
    },
    attributes: ['id', 'first_name', 'last_name', 'phone']
  });

  users.forEach(u => {
    recipients.push({
      user_id: u.id,
      phone: formatPhoneNumber(u.phone),
      name: `${u.first_name} ${u.last_name}`
    });
  });

  const players = await Player.findAll({
    where: {
      id: { [Op.in]: ids },
      branch_id: branchId,
      status: 'active',
      emergency_contact_phone: { [Op.ne]: null }
    },
    attributes: ['id', 'first_name', 'last_name', 'emergency_contact_phone']
  });

  players.forEach(p => {
    recipients.push({
      user_id: null,
      player_id: p.id,
      phone: formatPhoneNumber(p.emergency_contact_phone),
      name: `${p.first_name} ${p.last_name}`
    });
  });

  const uniqueByPhone = new Map();
  recipients.forEach(r => {
    if (r.phone) uniqueByPhone.set(r.phone, r);
  });

  return [...uniqueByPhone.values()];
}

function assertBranchAdminBranch(req) {
  if (req.user.role === ROLES.BRANCH_ADMIN && !req.user.branch_id) {
    throw new AppError('Branch admin is not assigned to a branch', 403);
  }
}

function assertBranchAdminOwnMessage(req, sms) {
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);
    if (String(sms.sender_id) !== String(req.user.id) || String(sms.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Not authorized to access this SMS', 403);
    }
  }
}

function assertNoBranchAdminLeak(req, sms, senderRole) {
  if (req.user.role !== ROLES.BRANCH_ADMIN && senderRole === ROLES.BRANCH_ADMIN) {
    throw new AppError('SMS message not found', 404);
  }
}

function assertBranchAdminOwnAutoSetting(req, setting) {
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);
    if (String(setting.branch_id || '') !== String(req.user.branch_id)) {
      throw new AppError('Auto SMS setting not found', 404);
    }
  }
}

async function normalizeBranchAutoAudience(branchId, rawAudience) {
  if (!rawAudience || rawAudience.type === 'all') {
    return { type: 'roles', roles: BRANCH_SMS_ALLOWED_ROLES };
  }

  if (rawAudience.type === 'roles') {
    const roles = (rawAudience.roles || [])
      .map(r => String(r || '').toLowerCase())
      .filter(r => BRANCH_SMS_ALLOWED_ROLES.includes(r));
    if (roles.length === 0) {
      throw new AppError('At least one role is required (coach, parent, player)', 400);
    }
    return { type: 'roles', roles: [...new Set(roles)] };
  }

  if (rawAudience.type === 'users') {
    const selectedIds = Array.isArray(rawAudience.users) ? rawAudience.users : [];
    if (selectedIds.length === 0) {
      throw new AppError('At least one user is required', 400);
    }
    // Validate that selected IDs belong to this branch and are allowed recipients.
    const validRecipients = await getBranchAudienceRecipientsByUsers(branchId, selectedIds);
    if (validRecipients.length === 0) {
      throw new AppError('No valid recipients found in your branch', 400);
    }
    const normalizedIds = validRecipients
      .map(r => r.user_id || r.player_id)
      .filter(Boolean);
    return { type: 'users', users: [...new Set(normalizedIds)] };
  }

  throw new AppError('Invalid audience type for branch admin', 400);
}

/**
 * @desc    Get all SMS messages
 * @route   GET /api/sms
 * @access  Private/Admin
 */
exports.getAllSMS = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, recipient_type, branch_id } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};
  const senderWhere = {};

  if (status) where.status = status;
  if (recipient_type) where.recipient_type = recipient_type;
  if (branch_id) where.branch_id = branch_id;

  // Role-based filtering
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);
    where.branch_id = req.user.branch_id;
    where.sender_id = req.user.id;
  } else {
    // Branch-admin sent SMS is private to the sender only
    senderWhere.role = { [Op.ne]: ROLES.BRANCH_ADMIN };
  }

  const messages = await SMS.findAndCountAll({
    where,
    include: [
      {
        association: 'sender',
        attributes: ['id', 'first_name', 'last_name', 'role'],
        where: Object.keys(senderWhere).length > 0 ? senderWhere : undefined,
        required: true
      },
      { association: 'branch', attributes: ['id', 'name'] }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(messages, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get SMS by ID
 * @route   GET /api/sms/:id
 * @access  Private/Admin
 */
exports.getSMSById = asyncHandler(async (req, res) => {
  const sms = await SMS.findByPk(req.params.id, {
    include: [
      { association: 'sender', attributes: ['id', 'first_name', 'last_name', 'role'] },
      { association: 'branch' },
      { association: 'program' }
    ]
  });

  if (!sms) {
    throw new AppError('SMS message not found', 404);
  }

  assertBranchAdminOwnMessage(req, sms);
  assertNoBranchAdminLeak(req, sms, sms.sender?.role);

  res.json({
    success: true,
    data: sms
  });
});

/**
 * @desc    Send SMS
 * @route   POST /api/sms/send
 * @access  Private/Admin
 */
exports.sendSMS = asyncHandler(async (req, res) => {
  const { message, recipient_type, recipients, branch_id, program_id, template_id } = req.body;

  let recipientList = [];
  let audienceType = recipient_type;

  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);

    let requestedRoles = BRANCH_SMS_ALLOWED_ROLES;
    let requestedUsers = [];
    if (typeof recipient_type === 'object' && recipient_type !== null) {
      if (recipient_type.type === 'roles') {
        requestedRoles = recipient_type.roles || [];
      } else if (recipient_type.type === 'users') {
        requestedUsers = recipient_type.users || [];
      } else if (recipient_type.type === 'all') {
        requestedRoles = BRANCH_SMS_ALLOWED_ROLES;
      } else {
        throw new AppError('Branch admins can only send to branch audience (all, roles, users)', 403);
      }
    } else if (recipient_type === 'all') {
      requestedRoles = BRANCH_SMS_ALLOWED_ROLES;
    } else if (recipient_type === 'group') {
      requestedRoles = BRANCH_SMS_ALLOWED_ROLES;
    }

    recipientList = requestedUsers.length > 0
      ? await getBranchAudienceRecipientsByUsers(req.user.branch_id, requestedUsers)
      : await getBranchAudienceRecipients(req.user.branch_id, requestedRoles);
    audienceType = 'branch';

    if (recipientList.length === 0) {
      throw new AppError('No recipients found in your branch', 400);
    }

    const sms = await SMS.create({
      sender_id: req.user.id,
      recipient_type: 'branch',
      recipients: recipientList,
      message,
      template_id,
      branch_id: req.user.branch_id,
      program_id: null,
      total_recipients: recipientList.length,
      status: SMS_STATUS.PENDING
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      await sms.update({
        status: SMS_STATUS.SENT,
        sent_at: new Date(),
        successful_count: recipientList.length,
        failed_count: 0
      });

      return res.status(201).json({
        success: true,
        message: `SMS sent to ${recipientList.length} recipients`,
        data: sms
      });
    } catch (error) {
      await sms.update({
        status: SMS_STATUS.FAILED,
        error_message: error.message
      });
      throw new AppError('Failed to send SMS', 500);
    }
  }

  // Handle new JSON audience format
  if (typeof recipient_type === 'object' && recipient_type !== null) {
    const audience = recipient_type;
    audienceType = audience.type || 'all';

    if (audience.type === 'all') {
      // Get all users with phones
      const users = await User.findAll({
        where: { is_active: true, phone: { [Op.ne]: null } },
        attributes: ['id', 'phone', 'first_name', 'last_name']
      });
      recipientList = users.map(u => ({
        user_id: u.id,
        phone: formatPhoneNumber(u.phone),
        name: `${u.first_name} ${u.last_name}`
      }));
    } else if (audience.type === 'roles' && audience.roles) {
      // Get users by roles
      const users = await User.findAll({
        where: { 
          is_active: true, 
          phone: { [Op.ne]: null },
          role: { [Op.in]: audience.roles }
        },
        attributes: ['id', 'phone', 'first_name', 'last_name', 'role']
      });
      recipientList = users.map(u => ({
        user_id: u.id,
        phone: formatPhoneNumber(u.phone),
        name: `${u.first_name} ${u.last_name}`
      }));
    } else if (audience.type === 'specific') {
      // Get specific users by IDs
      const userIds = audience.users || [];
      if (userIds.length > 0) {
        const users = await User.findAll({
          where: { 
            id: { [Op.in]: userIds },
            phone: { [Op.ne]: null }
          },
          attributes: ['id', 'phone', 'first_name', 'last_name']
        });
        recipientList = users.map(u => ({
          user_id: u.id,
          phone: formatPhoneNumber(u.phone),
          name: `${u.first_name} ${u.last_name}`
        }));
      }
    }
  } else if (recipient_type === 'individual' && recipients) {
    // Legacy format: individual recipients
    recipientList = recipients;
  } else if (recipient_type === 'all') {
    // Legacy format: all users
    const users = await User.findAll({
      where: { is_active: true, phone: { [Op.ne]: null } },
      attributes: ['id', 'phone', 'first_name', 'last_name']
    });
    recipientList = users.map(u => ({
      user_id: u.id,
      phone: formatPhoneNumber(u.phone),
      name: `${u.first_name} ${u.last_name}`
    }));
  }

  if (recipientList.length === 0) {
    throw new AppError('No recipients found. Make sure users have phone numbers registered.', 400);
  }

  // Determine recipient_type for storage (must be valid ENUM value)
  let storedRecipientType = 'all';
  if (typeof audienceType === 'string' && ['individual', 'group', 'branch', 'program', 'all'].includes(audienceType)) {
    storedRecipientType = audienceType;
  }

  // Create SMS record
  const sms = await SMS.create({
    sender_id: req.user.id,
    recipient_type: storedRecipientType,
    recipients: recipientList,
    message,
    template_id,
    branch_id: branch_id || req.user.branch_id,
    program_id,
    total_recipients: recipientList.length,
    status: SMS_STATUS.PENDING
  });

  // TODO: Integrate with actual SMS provider (Twilio, etc.)
  // For now, simulate sending
  try {
    // Simulate SMS sending
    await new Promise(resolve => setTimeout(resolve, 100));

    await sms.update({
      status: SMS_STATUS.SENT,
      sent_at: new Date(),
      successful_count: recipientList.length,
      failed_count: 0
    });

    res.status(201).json({
      success: true,
      message: `SMS sent to ${recipientList.length} recipients`,
      data: sms
    });
  } catch (error) {
    await sms.update({
      status: SMS_STATUS.FAILED,
      error_message: error.message
    });

    throw new AppError('Failed to send SMS', 500);
  }
});

/**
 * @desc    Send SMS to branch
 * @route   POST /api/sms/send-branch
 * @access  Private/Admin
 */
exports.sendToBranch = asyncHandler(async (req, res) => {
  const { message, branch_id, include_parents = true, include_staff = false } = req.body;
  const targetBranchId = req.user.role === ROLES.BRANCH_ADMIN
    ? req.user.branch_id
    : (branch_id || req.user.branch_id);

  if (!targetBranchId) {
    throw new AppError('Branch ID is required', 400);
  }

  if (req.user.role === ROLES.BRANCH_ADMIN && String(targetBranchId) !== String(req.user.branch_id)) {
    throw new AppError('You can only send to your own branch', 403);
  }

  const recipientList = [];

  // Get parents of players in this branch
  if (include_parents) {
    const players = await Player.findAll({
      where: { branch_id: targetBranchId, status: 'active' },
      include: [{ association: 'parent', attributes: ['id', 'phone', 'first_name', 'last_name'] }]
    });

    const parentMap = new Map();
    players.forEach(player => {
      if (player.parent && player.parent.phone) {
        parentMap.set(player.parent.id, {
          user_id: player.parent.id,
          phone: formatPhoneNumber(player.parent.phone),
          name: `${player.parent.first_name} ${player.parent.last_name}`
        });
      }
    });
    recipientList.push(...parentMap.values());
  }

  // Get staff in this branch
  if (include_staff) {
    const staff = await User.findAll({
      where: {
        branch_id: targetBranchId,
        is_active: true,
        phone: { [Op.ne]: null },
        role: { [Op.in]: [ROLES.COACH, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT] }
      },
      attributes: ['id', 'phone', 'first_name', 'last_name']
    });

    staff.forEach(s => {
      recipientList.push({
        user_id: s.id,
        phone: formatPhoneNumber(s.phone),
        name: `${s.first_name} ${s.last_name}`
      });
    });
  }

  if (recipientList.length === 0) {
    throw new AppError('No recipients found in this branch', 400);
  }

  const sms = await SMS.create({
    sender_id: req.user.id,
    recipient_type: 'branch',
    recipients: recipientList,
    message,
    branch_id: targetBranchId,
    total_recipients: recipientList.length,
    status: SMS_STATUS.SENT,
    sent_at: new Date(),
    successful_count: recipientList.length
  });

  res.status(201).json({
    success: true,
    message: `SMS sent to ${recipientList.length} recipients in branch`,
    data: sms
  });
});

/**
 * @desc    Send SMS to program
 * @route   POST /api/sms/send-program
 * @access  Private/Admin
 */
exports.sendToProgram = asyncHandler(async (req, res) => {
  const { message, program_id } = req.body;

  if (!program_id) {
    throw new AppError('Program ID is required', 400);
  }

  const program = await Program.findByPk(program_id);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);
    if (String(program.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('You can only send to programs in your branch', 403);
    }
  }

  // Get parents of players in this program
  const players = await Player.findAll({
    where: { program_id, status: 'active' },
    include: [{ association: 'parent', attributes: ['id', 'phone', 'first_name', 'last_name'] }]
  });

  const parentMap = new Map();
  players.forEach(player => {
    if (player.parent && player.parent.phone) {
      parentMap.set(player.parent.id, {
        user_id: player.parent.id,
        phone: formatPhoneNumber(player.parent.phone),
        name: `${player.parent.first_name} ${player.parent.last_name}`
      });
    }
  });

  const recipientList = [...parentMap.values()];

  if (recipientList.length === 0) {
    throw new AppError('No recipients found in this program', 400);
  }

  const sms = await SMS.create({
    sender_id: req.user.id,
    recipient_type: 'program',
    recipients: recipientList,
    message,
    branch_id: program.branch_id,
    program_id,
    total_recipients: recipientList.length,
    status: SMS_STATUS.SENT,
    sent_at: new Date(),
    successful_count: recipientList.length
  });

  res.status(201).json({
    success: true,
    message: `SMS sent to ${recipientList.length} parents in program`,
    data: sms
  });
});

/**
 * @desc    Schedule SMS
 * @route   POST /api/sms/schedule
 * @access  Private/Admin
 */
exports.scheduleSMS = asyncHandler(async (req, res) => {
  const { message, recipient_type, recipients, scheduled_at, branch_id, program_id } = req.body;

  if (!scheduled_at) {
    throw new AppError('Scheduled time is required', 400);
  }

  const scheduledDate = new Date(scheduled_at);
  if (scheduledDate <= new Date()) {
    throw new AppError('Scheduled time must be in the future', 400);
  }

  const sms = await SMS.create({
    sender_id: req.user.id,
    recipient_type,
    recipients: recipients || [],
    message,
    branch_id: req.user.role === ROLES.BRANCH_ADMIN ? req.user.branch_id : (branch_id || req.user.branch_id),
    program_id,
    total_recipients: recipients?.length || 0,
    status: SMS_STATUS.PENDING,
    scheduled_at: scheduledDate
  });

  res.status(201).json({
    success: true,
    message: 'SMS scheduled successfully',
    data: sms
  });
});

/**
 * @desc    Cancel scheduled SMS
 * @route   DELETE /api/sms/:id/cancel
 * @access  Private/Admin
 */
exports.cancelScheduledSMS = asyncHandler(async (req, res) => {
  const sms = await SMS.findByPk(req.params.id, {
    include: [{ association: 'sender', attributes: ['id', 'role'] }]
  });

  if (!sms) {
    throw new AppError('SMS message not found', 404);
  }

  assertBranchAdminOwnMessage(req, sms);
  assertNoBranchAdminLeak(req, sms, sms.sender?.role);

  if (sms.status !== SMS_STATUS.PENDING) {
    throw new AppError('Only pending SMS can be cancelled', 400);
  }

  await sms.destroy();

  res.json({
    success: true,
    message: 'Scheduled SMS cancelled successfully'
  });
});

/**
 * @desc    Get SMS templates
 * @route   GET /api/sms/templates/list
 * @access  Private/Admin
 */
exports.getTemplates = asyncHandler(async (req, res) => {
  // Predefined templates
  const templates = [
    {
      id: 'payment_reminder',
      name: 'Payment Reminder',
      name_ar: 'تذكير بالدفع',
      message: 'Dear {parent_name}, this is a reminder that payment for {player_name} is due on {due_date}. Amount: {amount} SAR.',
      message_ar: 'عزيزي {parent_name}، هذا تذكير بأن موعد سداد اشتراك {player_name} هو {due_date}. المبلغ: {amount} ريال.'
    },
    {
      id: 'attendance_alert',
      name: 'Attendance Alert',
      name_ar: 'تنبيه الحضور',
      message: 'Dear {parent_name}, {player_name} was marked as {status} for today\'s session.',
      message_ar: 'عزيزي {parent_name}، تم تسجيل {player_name} بحالة {status} في جلسة اليوم.'
    },
    {
      id: 'schedule_change',
      name: 'Schedule Change',
      name_ar: 'تغيير الموعد',
      message: 'Important: The training schedule for {program_name} has been changed. New time: {new_time}.',
      message_ar: 'هام: تم تغيير موعد تدريب {program_name}. الموعد الجديد: {new_time}.'
    },
    {
      id: 'general_announcement',
      name: 'General Announcement',
      name_ar: 'إعلان عام',
      message: '{message}',
      message_ar: '{message}'
    }
  ];

  res.json({
    success: true,
    data: templates
  });
});

/**
 * @desc    Get SMS balance (mock)
 * @route   GET /api/sms/account/balance
 * @access  Private/Admin
 */
exports.getBalance = asyncHandler(async (req, res) => {
  // Mock SMS balance - integrate with actual provider
  res.json({
    success: true,
    data: {
      balance: 1000,
      currency: 'SAR',
      credits_remaining: 5000,
      provider: process.env.SMS_PROVIDER || 'twilio'
    }
  });
});

/**
 * @desc    Get SMS statistics
 * @route   GET /api/sms/stats
 * @access  Private/Admin
 */
exports.getSMSStats = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  const where = {};

  if (start_date && end_date) {
    where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
  }

  const [total, sent, failed, totalRecipients, totalCost] = await Promise.all([
    SMS.count({ where }),
    SMS.count({ where: { ...where, status: SMS_STATUS.SENT } }),
    SMS.count({ where: { ...where, status: SMS_STATUS.FAILED } }),
    SMS.sum('total_recipients', { where }),
    SMS.sum('cost', { where })
  ]);

  res.json({
    success: true,
    data: {
      total_messages: total,
      sent,
      failed,
      pending: total - sent - failed,
      total_recipients: totalRecipients || 0,
      total_cost: totalCost || 0
    }
  });
});

// ==================== AUTO SMS SETTINGS ====================

/**
 * @desc    Get all auto SMS settings
 * @route   GET /api/sms/auto-settings
 * @access  Private/Admin
 */
exports.getAutoSMSSettings = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);
    where.branch_id = req.user.branch_id;
  }

  const settings = await AutoSMSSettings.findAll({
    where,
    include: [{ association: 'branch', attributes: ['id', 'name'] }],
    order: [['type', 'ASC'], ['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: settings
  });
});

/**
 * @desc    Get auto SMS setting by ID
 * @route   GET /api/sms/auto-settings/:id
 * @access  Private/Admin
 */
exports.getAutoSMSSettingById = asyncHandler(async (req, res) => {
  const setting = await AutoSMSSettings.findByPk(req.params.id, {
    include: [{ association: 'branch' }]
  });

  if (!setting) {
    throw new AppError('Auto SMS setting not found', 404);
  }

  assertBranchAdminOwnAutoSetting(req, setting);

  res.json({
    success: true,
    data: setting
  });
});

/**
 * @desc    Create auto SMS setting
 * @route   POST /api/sms/auto-settings
 * @access  Private/Admin
 */
exports.createAutoSMSSetting = asyncHandler(async (req, res) => {
  const {
    title, title_ar, type, enabled, trigger_mode, days_before, days_after, specific_date,
    message, message_ar, target_role, branch_id, send_time,
    schedule_type, start_date, end_date, send_days, target_audience
  } = req.body;

  // Validate type
  const validTypes = ['subscription_expiring', 'payment_overdue', 'session_reminder', 'birthday', 'custom'];
  if (!validTypes.includes(type)) {
    throw new AppError('Invalid type. Must be one of: ' + validTypes.join(', '), 400);
  }

  let effectiveType = type;
  let effectiveBranchId = branch_id || null;
  let effectiveTargetAudience = target_audience || null;
  let effectiveTargetRole = target_role || 'parent';

  if (req.user.role === ROLES.BRANCH_ADMIN) {
    assertBranchAdminBranch(req);
    // Branch admins can only create branch-scoped custom auto SMS.
    effectiveType = 'custom';
    effectiveBranchId = req.user.branch_id;
    effectiveTargetRole = 'all';
    effectiveTargetAudience = await normalizeBranchAutoAudience(req.user.branch_id, target_audience);
  }

  const setting = await AutoSMSSettings.create({
    title,
    title_ar,
    type: effectiveType,
    enabled: enabled !== false,
    trigger_mode: trigger_mode || 'days',
    days_before: days_before || 0,
    days_after: days_after || 0,
    specific_date: specific_date || null,
    message,
    message_ar,
    target_role: effectiveTargetRole,
    branch_id: effectiveBranchId,
    send_time: send_time || '09:00:00',
    schedule_type: schedule_type || 'date_range',
    start_date: start_date || null,
    end_date: end_date || null,
    send_days: send_days || [],
    target_audience: effectiveTargetAudience
  });

  res.status(201).json({
    success: true,
    message: 'Auto SMS setting created successfully',
    data: setting
  });
});

/**
 * @desc    Update auto SMS setting
 * @route   PUT /api/sms/auto-settings/:id
 * @access  Private/Admin
 */
exports.updateAutoSMSSetting = asyncHandler(async (req, res) => {
  const setting = await AutoSMSSettings.findByPk(req.params.id);

  if (!setting) {
    throw new AppError('Auto SMS setting not found', 404);
  }

  assertBranchAdminOwnAutoSetting(req, setting);

  const {
    title, title_ar, enabled, trigger_mode, days_before, days_after, specific_date,
    message, message_ar, target_role, branch_id, send_time,
    schedule_type, start_date, end_date, send_days, target_audience
  } = req.body;

  let effectiveBranchId = branch_id;
  let effectiveTargetRole = target_role;
  let effectiveTargetAudience = target_audience;

  if (req.user.role === ROLES.BRANCH_ADMIN) {
    effectiveBranchId = req.user.branch_id;
    effectiveTargetRole = 'all';
    effectiveTargetAudience = target_audience !== undefined
      ? await normalizeBranchAutoAudience(req.user.branch_id, target_audience)
      : setting.target_audience;
  }

  await setting.update({
    title: title !== undefined ? title : setting.title,
    title_ar: title_ar !== undefined ? title_ar : setting.title_ar,
    enabled: enabled !== undefined ? enabled : setting.enabled,
    trigger_mode: trigger_mode !== undefined ? trigger_mode : setting.trigger_mode,
    days_before: days_before !== undefined ? days_before : setting.days_before,
    days_after: days_after !== undefined ? days_after : setting.days_after,
    specific_date: specific_date !== undefined ? specific_date : setting.specific_date,
    message: message !== undefined ? message : setting.message,
    message_ar: message_ar !== undefined ? message_ar : setting.message_ar,
    target_role: effectiveTargetRole !== undefined ? effectiveTargetRole : setting.target_role,
    branch_id: effectiveBranchId !== undefined ? effectiveBranchId : setting.branch_id,
    send_time: send_time !== undefined ? send_time : setting.send_time,
    schedule_type: schedule_type !== undefined ? schedule_type : setting.schedule_type,
    start_date: start_date !== undefined ? start_date : setting.start_date,
    end_date: end_date !== undefined ? end_date : setting.end_date,
    send_days: send_days !== undefined ? send_days : setting.send_days,
    target_audience: effectiveTargetAudience !== undefined ? effectiveTargetAudience : setting.target_audience
  });

  res.json({
    success: true,
    message: 'Auto SMS setting updated successfully',
    data: setting
  });
});

/**
 * @desc    Delete auto SMS setting
 * @route   DELETE /api/sms/auto-settings/:id
 * @access  Private/Admin
 */
exports.deleteAutoSMSSetting = asyncHandler(async (req, res) => {
  const setting = await AutoSMSSettings.findByPk(req.params.id);

  if (!setting) {
    throw new AppError('Auto SMS setting not found', 404);
  }

  assertBranchAdminOwnAutoSetting(req, setting);

  await setting.destroy();

  res.json({
    success: true,
    message: 'Auto SMS setting deleted successfully'
  });
});

/**
 * @desc    Manually trigger auto SMS (for testing)
 * @route   POST /api/sms/trigger-auto
 * @access  Private/SuperAdmin
 */
exports.triggerAutoSMS = asyncHandler(async (req, res) => {
  const { type } = req.body;

  console.log(`📲 Manual trigger of auto SMS by ${req.user.email}`);

  const results = await smsScheduler.runAllAutoSMS();

  res.json({
    success: true,
    message: 'Auto SMS triggered successfully',
    data: {
      results,
      triggered_by: req.user.email,
      triggered_at: new Date()
    }
  });
});

/**
 * @desc    Get scheduler status
 * @route   GET /api/sms/scheduler-status
 * @access  Private/Admin
 */
exports.getSchedulerStatus = asyncHandler(async (req, res) => {
  const status = smsScheduler.getStatus();

  // Get last run info from settings
  const settings = await AutoSMSSettings.findAll({
    attributes: ['type', 'last_run_at', 'last_run_count'],
    where: { enabled: true }
  });

  res.json({
    success: true,
    data: {
      ...status,
      enabled_jobs: settings.map(s => ({
        type: s.type,
        last_run: s.last_run_at,
        last_count: s.last_run_count
      }))
    }
  });
});

/**
 * @desc    Update SMS message
 * @route   PUT /api/sms/:id
 * @access  Private/Admin
 */
exports.updateSMS = asyncHandler(async (req, res) => {
  const { message } = req.body;

  const sms = await SMS.findByPk(req.params.id, {
    include: [{ association: 'sender', attributes: ['id', 'role'] }]
  });

  if (!sms) {
    throw new AppError('SMS message not found', 404);
  }

  assertBranchAdminOwnMessage(req, sms);
  assertNoBranchAdminLeak(req, sms, sms.sender?.role);

  await sms.update({ message });

  res.json({
    success: true,
    message: 'SMS updated successfully',
    data: sms
  });
});

/**
 * @desc    Delete SMS message
 * @route   DELETE /api/sms/:id
 * @access  Private/Admin
 */
exports.deleteSMS = asyncHandler(async (req, res) => {
  const sms = await SMS.findByPk(req.params.id, {
    include: [{ association: 'sender', attributes: ['id', 'role'] }]
  });

  if (!sms) {
    throw new AppError('SMS message not found', 404);
  }

  assertBranchAdminOwnMessage(req, sms);
  assertNoBranchAdminLeak(req, sms, sms.sender?.role);

  await sms.destroy();

  res.json({
    success: true,
    message: 'SMS deleted successfully'
  });
});

