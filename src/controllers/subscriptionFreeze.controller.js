const { SubscriptionFreeze, Subscription, Branch, Program, Player, User } = require('../models');
const { Op, literal } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const NotificationService = require('../services/notification.service');
const { ROLES } = require('../config/constants');

const includeAssociations = [
  { association: 'branch', attributes: ['id', 'name', 'name_ar'] },
  { association: 'program', attributes: ['id', 'name', 'name_ar'] },
  { association: 'player', attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar'] },
  { association: 'creator', attributes: ['id', 'first_name', 'last_name'] }
];

/**
 * Calculate freeze days between two dates (inclusive)
 */
function calcFreezeDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Build subscription WHERE clause based on freeze scope
 */
function buildScopeWhere(freeze) {
  const where = {
    status: { [Op.in]: ['active', 'pending'] },
    end_date: { [Op.gte]: freeze.start_date }
  };

  if (freeze.scope === 'program') {
    where.program_id = freeze.program_id;
  } else if (freeze.scope === 'branch') {
    // For branch scope, need to find programs in that branch then filter subscriptions
    // We'll handle this with include below
  }
  if (freeze.player_id) {
    where.player_id = freeze.player_id;
  }
  // global: no extra filter

  return where;
}

/**
 * Get affected subscriptions for a freeze
 */
async function getAffectedSubscriptions(freeze) {
  const where = buildScopeWhere(freeze);
  const include = [];

  if (freeze.scope === 'branch') {
    include.push({
      model: Program,
      as: 'program',
      attributes: ['id', 'name'],
      where: { branch_id: freeze.branch_id },
      required: true
    });
  }

  return Subscription.findAll({ where, include });
}

/**
 * Extend subscription end dates by freeze_days
 */
async function extendSubscriptions(freeze) {
  const subscriptions = await getAffectedSubscriptions(freeze);

  for (const sub of subscriptions) {
    const currentEnd = new Date(sub.end_date);
    currentEnd.setDate(currentEnd.getDate() + freeze.freeze_days);
    const newEndDate = currentEnd.toISOString().split('T')[0];

    await sub.update({
      end_date: newEndDate,
      notes: (sub.notes || '') + `\n[Freeze] Extended ${freeze.freeze_days} days - ${freeze.title} (${freeze.start_date} to ${freeze.end_date})`
    });
  }

  return subscriptions.length;
}

/**
 * Revert subscription end dates by freeze_days (undo)
 */
async function revertSubscriptions(freeze) {
  const subscriptions = await getAffectedSubscriptions(freeze);

  for (const sub of subscriptions) {
    const currentEnd = new Date(sub.end_date);
    currentEnd.setDate(currentEnd.getDate() - freeze.freeze_days);
    const newEndDate = currentEnd.toISOString().split('T')[0];

    await sub.update({
      end_date: newEndDate,
      notes: (sub.notes || '') + `\n[Freeze Cancelled] Reverted ${freeze.freeze_days} days - ${freeze.title}`
    });
  }

  return subscriptions.length;
}

/**
 * Notify parents about a freeze
 */
async function notifyParentsAboutFreeze(freeze, isCancellation = false) {
  try {
    const subscriptions = await getAffectedSubscriptions(freeze);

    // Collect unique parent IDs from affected players
    const playerIds = [...new Set(subscriptions.map(s => s.player_id))];
    const players = await Player.findAll({
      where: { id: { [Op.in]: playerIds } },
      attributes: ['id', 'first_name', 'last_name', 'parent_id'],
      include: [{ model: User, as: 'parent', attributes: ['id'] }]
    });

    const parentIds = [...new Set(players.filter(p => p.parent_id).map(p => p.parent_id))];

    const scopeText = freeze.scope === 'global' ? 'all branches' :
      freeze.scope === 'branch' ? `branch` : `program`;

    for (const parentId of parentIds) {
      if (isCancellation) {
        await NotificationService.create({
          userId: parentId,
          type: 'freeze_cancelled',
          title: `Subscription Freeze Cancelled: ${freeze.title}`,
          titleAr: `تم إلغاء تجميد الاشتراك: ${freeze.title_ar || freeze.title}`,
          message: `The subscription freeze "${freeze.title}" (${freeze.start_date} to ${freeze.end_date}) has been cancelled. ${freeze.freeze_days} days have been subtracted back from your subscription.`,
          messageAr: `تم إلغاء تجميد الاشتراك "${freeze.title_ar || freeze.title}" (${freeze.start_date} إلى ${freeze.end_date}). تم خصم ${freeze.freeze_days} أيام من اشتراكك.`,
          data: { freeze_id: freeze.id }
        });
      } else {
        await NotificationService.create({
          userId: parentId,
          type: 'freeze_created',
          title: `Subscription Frozen: ${freeze.title}`,
          titleAr: `تجميد الاشتراك: ${freeze.title_ar || freeze.title}`,
          message: `Your subscription has been extended by ${freeze.freeze_days} days due to "${freeze.title}" (${freeze.start_date} to ${freeze.end_date}). No action needed.`,
          messageAr: `تم تمديد اشتراكك ${freeze.freeze_days} أيام بسبب "${freeze.title_ar || freeze.title}" (${freeze.start_date} إلى ${freeze.end_date}). لا حاجة لأي إجراء.`,
          data: { freeze_id: freeze.id }
        });
      }
    }
  } catch (error) {
    console.error('Failed to notify parents about freeze:', error);
  }
}

// ─────────────────────────────────────────────
// CONTROLLER METHODS
// ─────────────────────────────────────────────

/**
 * @desc    Get all subscription freezes
 * @route   GET /api/subscription-freezes
 * @access  Private (super_admin, owner)
 */
exports.getAllFreezes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, scope } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};
  if (status) where.status = status;
  if (scope) where.scope = scope;

  // Branch admins can only view freezes in their own branch
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id) {
      throw new AppError('Branch admin is not assigned to a branch', 403);
    }
    where.branch_id = req.user.branch_id;
  }

  const result = await SubscriptionFreeze.findAndCountAll({
    where,
    include: includeAssociations,
    order: [['created_at', 'DESC']],
    limit: limitNum,
    offset
  });

  const response = formatPaginationResponse(result, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Create a subscription freeze
 * @route   POST /api/subscription-freezes
 * @access  Private (super_admin, owner)
 */
exports.createFreeze = asyncHandler(async (req, res) => {
  const { title, title_ar, start_date, end_date, scope, branch_id, program_id, player_id } = req.body;
  let effectiveScope = scope || 'global';
  let effectiveBranchId = branch_id;
  let effectiveProgramId = program_id;
  let effectivePlayerId = player_id || null;

  // UI helper scope; persist as program scope with player filter
  if (effectiveScope === 'program_player') {
    effectiveScope = 'program';
  }

  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id) {
      throw new AppError('Branch admin is not assigned to a branch', 403);
    }
    // Branch admins are limited to their own branch and can choose:
    // all in branch OR specific program OR specific player within a program.
    effectiveScope = effectiveScope === 'program' ? 'program' : 'branch';
    effectiveBranchId = req.user.branch_id;
    if (effectiveScope !== 'program') {
      effectiveProgramId = null;
      effectivePlayerId = null;
    }
  }

  // Validation
  if (!title || !start_date || !end_date) {
    throw new AppError('Title, start date, and end date are required', 400);
  }

  if (new Date(end_date) < new Date(start_date)) {
    throw new AppError('End date must be after start date', 400);
  }

  // Validate scope-specific fields
  if (effectiveScope === 'branch' && !effectiveBranchId) {
    throw new AppError('Branch is required for branch scope', 400);
  }
  if (effectiveScope === 'program' && !effectiveProgramId) {
    throw new AppError('Program is required for program scope', 400);
  }
  if (effectivePlayerId && effectiveScope !== 'program') {
    throw new AppError('Player targeting is only supported for program scope', 400);
  }

  if (effectiveScope === 'branch') {
    const branch = await Branch.findByPk(effectiveBranchId);
    if (!branch) throw new AppError('Branch not found', 404);
  }

  if (effectiveScope === 'program') {
    const program = await Program.findByPk(effectiveProgramId);
    if (!program) throw new AppError('Program not found', 404);
    if (effectiveBranchId && String(program.branch_id) !== String(effectiveBranchId)) {
      throw new AppError('Program does not belong to selected branch', 400);
    }
  }

  if (effectivePlayerId) {
    const player = await Player.findByPk(effectivePlayerId);
    if (!player) throw new AppError('Player not found', 404);
    if (effectiveBranchId && String(player.branch_id) !== String(effectiveBranchId)) {
      throw new AppError('Player does not belong to selected branch', 400);
    }
    if (effectiveProgramId && String(player.program_id) !== String(effectiveProgramId)) {
      throw new AppError('Player does not belong to selected program', 400);
    }
  }

  // Check for overlapping freezes with same scope
  const overlap = await SubscriptionFreeze.findOne({
    where: {
      status: { [Op.in]: ['scheduled', 'active'] },
      start_date: { [Op.lte]: end_date },
      end_date: { [Op.gte]: start_date },
      ...(effectiveScope === 'branch' ? { branch_id: effectiveBranchId } : {}),
      ...(effectiveScope === 'program' ? { program_id: effectiveProgramId } : {}),
      ...(effectiveScope === 'program' ? { player_id: effectivePlayerId || null } : {}),
      scope: effectiveScope
    }
  });

  if (overlap) {
    throw new AppError('An overlapping freeze already exists for this scope', 400);
  }

  const freeze_days = calcFreezeDays(start_date, end_date);

  // Determine initial status
  const today = new Date().toISOString().split('T')[0];
  let initialStatus = 'scheduled';
  if (start_date <= today && end_date >= today) {
    initialStatus = 'active';
  } else if (end_date < today) {
    initialStatus = 'completed';
  }

  const freeze = await SubscriptionFreeze.create({
    title,
    title_ar: title_ar || null,
    start_date,
    end_date,
    freeze_days,
    scope: effectiveScope,
    branch_id: (effectiveScope === 'branch' || effectiveScope === 'program') ? effectiveBranchId : null,
    program_id: effectiveScope === 'program' ? effectiveProgramId : null,
    player_id: effectiveScope === 'program' ? effectivePlayerId : null,
    status: initialStatus,
    created_by: req.user.id,
    applied: false,
    subscriptions_affected: 0
  });

  // Immediately apply: extend all matching subscriptions
  const affected = await extendSubscriptions(freeze);
  await freeze.update({ applied: true, subscriptions_affected: affected });

  // Notify parents
  await notifyParentsAboutFreeze(freeze, false);

  // Reload with associations
  const result = await SubscriptionFreeze.findByPk(freeze.id, { include: includeAssociations });

  res.status(201).json({
    success: true,
    message: `Freeze created. ${affected} subscription(s) extended by ${freeze_days} days.`,
    data: result
  });
});

/**
 * @desc    Update a subscription freeze (cancel)
 * @route   PATCH /api/subscription-freezes/:id
 * @access  Private (super_admin, owner)
 */
exports.updateFreeze = asyncHandler(async (req, res) => {
  const freeze = await SubscriptionFreeze.findByPk(req.params.id);
  if (!freeze) {
    throw new AppError('Subscription freeze not found', 404);
  }

  // Branch admins can only cancel freezes from their own branch
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id || String(freeze.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Not authorized to modify this freeze', 403);
    }
  }

  const { status } = req.body;

  // Only allow cancelling scheduled/active freezes
  if (status === 'cancelled') {
    if (freeze.status === 'cancelled') {
      throw new AppError('Freeze is already cancelled', 400);
    }
    if (freeze.status === 'completed') {
      throw new AppError('Cannot cancel a completed freeze', 400);
    }

    // Revert: subtract freeze days back from subscriptions
    if (freeze.applied) {
      const reverted = await revertSubscriptions(freeze);
      await freeze.update({
        status: 'cancelled',
        subscriptions_affected: reverted
      });

      // Notify parents about cancellation
      await notifyParentsAboutFreeze(freeze, true);
    } else {
      await freeze.update({ status: 'cancelled' });
    }

    const result = await SubscriptionFreeze.findByPk(freeze.id, { include: includeAssociations });

    return res.json({
      success: true,
      message: `Freeze cancelled. ${freeze.subscriptions_affected} subscription(s) reverted.`,
      data: result
    });
  }

  throw new AppError('Only cancellation is supported', 400);
});

/**
 * @desc    Get active freezes (used by subscription creation to auto-extend)
 * @route   GET /api/subscription-freezes/active
 * @access  Private
 */
exports.getActiveFreezes = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const freezes = await SubscriptionFreeze.findAll({
    where: {
      status: { [Op.in]: ['scheduled', 'active'] },
      end_date: { [Op.gte]: today }
    },
    include: includeAssociations,
    order: [['start_date', 'ASC']]
  });

  res.json({
    success: true,
    data: freezes
  });
});
