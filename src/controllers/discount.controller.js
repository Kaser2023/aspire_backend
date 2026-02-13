const { Discount, Branch, Program, User, Player, ProgramPricingPlan, Payment } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');
const { logAuditEvent, getLatestAuditMap } = require('../utils/auditLogger');

const includeAssociations = [
  { association: 'branch', attributes: ['id', 'name', 'name_ar'] },
  { association: 'program', attributes: ['id', 'name', 'name_ar'] },
  { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] },
  { association: 'player', attributes: ['id', 'first_name', 'last_name', 'registration_number'] },
  { association: 'pricingPlan', attributes: ['id', 'name', 'name_ar', 'price', 'duration_months'] },
  { association: 'creator', attributes: ['id', 'first_name', 'last_name'] }
];

/**
 * @desc    Get all discounts
 * @route   GET /api/discounts
 * @access  Private (super_admin, owner, accountant)
 */
exports.getAllDiscounts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, branch_id, program_id, status, search } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (branch_id) where.branch_id = branch_id;
  if (program_id) where.program_id = program_id;
  if (status) where.status = status;

  if (search) {
    where.reason = { [Op.like]: `%${search}%` };
  }

  // Branch admins can only read discounts from their own branch
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id) {
      throw new AppError('Branch admin is not assigned to a branch', 403);
    }
    where.branch_id = req.user.branch_id;
  }

  const discounts = await Discount.findAndCountAll({
    where,
    include: includeAssociations,
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const latestAuditMap = await getLatestAuditMap('discount', discounts.rows.map((d) => d.id));
  const enrichedRows = discounts.rows.map((discount) => {
    const item = discount.toJSON();
    const latestAudit = latestAuditMap[item.id];
    const actor = latestAudit?.actor;
    item.last_updated_by = actor
      ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
      : (item.creator || null);
    item.last_updated_at = latestAudit?.created_at || item.updated_at || item.created_at;
    return item;
  });
  discounts.rows = enrichedRows;

  const response = formatPaginationResponse(discounts, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Create a discount
 * @route   POST /api/discounts
 * @access  Private (super_admin, owner, accountant)
 */
exports.createDiscount = asyncHandler(async (req, res) => {
  const {
    branch_id, program_id, user_id, player_id, pricing_plan_id,
    discount_type, discount_value, reason, expires_at
  } = req.body;

  const effectiveBranchId = req.user.role === ROLES.BRANCH_ADMIN
    ? req.user.branch_id
    : branch_id;

  // Validate required fields
  if (!effectiveBranchId) {
    throw new AppError('Branch is required', 400);
  }
  if (!discount_type || !['percentage', 'fixed'].includes(discount_type)) {
    throw new AppError('Discount type must be percentage or fixed', 400);
  }
  if (!discount_value || discount_value <= 0) {
    throw new AppError('Discount value must be greater than 0', 400);
  }
  if (discount_type === 'percentage' && discount_value > 100) {
    throw new AppError('Percentage discount cannot exceed 100%', 400);
  }

  // Verify branch exists
  const branch = await Branch.findByPk(effectiveBranchId);
  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  // Branch admins can only create discounts for their own branch
  if (req.user.role === ROLES.BRANCH_ADMIN && String(effectiveBranchId) !== String(req.user.branch_id)) {
    throw new AppError('You can only create discounts for your branch', 403);
  }

  // Verify program if provided
  if (program_id) {
    const program = await Program.findByPk(program_id);
    if (!program) {
      throw new AppError('Program not found', 404);
    }
    if (String(program.branch_id) !== String(effectiveBranchId)) {
      throw new AppError('Program does not belong to selected branch', 400);
    }
  }

  // Verify parent if provided
  if (user_id) {
    const user = await User.findByPk(user_id);
    if (!user) {
      throw new AppError('Parent not found', 404);
    }
    // Parent users may be linked through players; enforce by player branch if possible
    const parentPlayerInBranch = await Player.findOne({
      where: { parent_id: user_id, branch_id: effectiveBranchId },
      attributes: ['id']
    });
    if (!parentPlayerInBranch) {
      throw new AppError('Parent is not linked to selected branch', 400);
    }
  }

  // Verify player if provided
  if (player_id) {
    const player = await Player.findByPk(player_id);
    if (!player) {
      throw new AppError('Player not found', 404);
    }
    if (String(player.branch_id) !== String(effectiveBranchId)) {
      throw new AppError('Player does not belong to selected branch', 400);
    }
  }

  // Verify pricing plan if provided
  if (pricing_plan_id) {
    const plan = await ProgramPricingPlan.findByPk(pricing_plan_id, {
      include: [{ association: 'program', attributes: ['id', 'branch_id'] }]
    });
    if (!plan) {
      throw new AppError('Pricing plan not found', 404);
    }
    if (!plan.program || String(plan.program.branch_id) !== String(effectiveBranchId)) {
      throw new AppError('Pricing plan does not belong to selected branch', 400);
    }
  }

  const discount = await Discount.create({
    branch_id: effectiveBranchId,
    program_id: program_id || null,
    user_id: user_id || null,
    player_id: player_id || null,
    pricing_plan_id: pricing_plan_id || null,
    discount_type,
    discount_value,
    reason: reason || null,
    expires_at: expires_at || null,
    created_by: req.user.id,
    status: 'active'
  });

  // Fetch with associations
  const fullDiscount = await Discount.findByPk(discount.id, {
    include: includeAssociations
  });

  await logAuditEvent({
    module: 'discounts',
    entityType: 'discount',
    entityId: discount.id,
    action: 'create',
    actor: req.user,
    before: null,
    after: fullDiscount
  });

  const fullDiscountData = fullDiscount.toJSON();
  fullDiscountData.last_updated_by = fullDiscountData.creator || null;
  fullDiscountData.last_updated_at = fullDiscountData.updated_at || fullDiscountData.created_at;

  res.status(201).json({
    success: true,
    message: 'Discount created successfully',
    data: fullDiscountData
  });
});

/**
 * @desc    Update a discount (cancel, etc.)
 * @route   PATCH /api/discounts/:id
 * @access  Private (super_admin, owner, accountant)
 */
exports.updateDiscount = asyncHandler(async (req, res) => {
  const discount = await Discount.findByPk(req.params.id);

  if (!discount) {
    throw new AppError('Discount not found', 404);
  }

  // Branch admins can only update discounts from their own branch
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id || String(discount.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Not authorized to update this discount', 403);
    }
  }

  if (discount.status === 'used') {
    throw new AppError('Cannot modify a used discount', 400);
  }

  const { status, reason, expires_at, discount_value, discount_type } = req.body;

  const updateData = {};
  if (status && ['active', 'cancelled'].includes(status)) updateData.status = status;
  if (reason !== undefined) updateData.reason = reason;
  if (expires_at !== undefined) updateData.expires_at = expires_at;
  if (discount_value && discount_value > 0) updateData.discount_value = discount_value;
  if (discount_type && ['percentage', 'fixed'].includes(discount_type)) updateData.discount_type = discount_type;

  if (updateData.discount_type === 'percentage' && (updateData.discount_value || discount.discount_value) > 100) {
    throw new AppError('Percentage discount cannot exceed 100%', 400);
  }

  const beforeData = discount.toJSON();
  await discount.update(updateData);

  const fullDiscount = await Discount.findByPk(discount.id, {
    include: includeAssociations
  });

  await logAuditEvent({
    module: 'discounts',
    entityType: 'discount',
    entityId: discount.id,
    action: 'update',
    actor: req.user,
    before: beforeData,
    after: fullDiscount
  });

  const fullDiscountData = fullDiscount.toJSON();
  fullDiscountData.last_updated_by = {
    id: req.user.id,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    role: req.user.role
  };
  fullDiscountData.last_updated_at = fullDiscountData.updated_at || new Date().toISOString();

  res.json({
    success: true,
    message: 'Discount updated successfully',
    data: fullDiscountData
  });
});

/**
 * @desc    Get available discounts for a player/plan (used during payment)
 * @route   GET /api/discounts/available
 * @access  Private (super_admin, owner, accountant)
 */
exports.getAvailableDiscounts = asyncHandler(async (req, res) => {
  const { player_id, pricing_plan_id } = req.query;

  if (!player_id) {
    throw new AppError('player_id is required', 400);
  }

  // Get the player with their parent and branch/program info
  const player = await Player.findByPk(player_id, {
    include: [
      { association: 'branch', attributes: ['id'] },
      { association: 'program', attributes: ['id'] }
    ]
  });

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  const today = new Date().toISOString().split('T')[0];

  // Build OR conditions for matching discounts at all scope levels
  const scopeConditions = [];

  // 1. Branch-level: branch matches, no program/user/player specified
  if (player.branch_id) {
    scopeConditions.push({
      branch_id: player.branch_id,
      program_id: null,
      user_id: null,
      player_id: null
    });
  }

  // 2. Program-level: branch+program match, no user/player specified
  if (player.branch_id && player.program_id) {
    scopeConditions.push({
      branch_id: player.branch_id,
      program_id: player.program_id,
      user_id: null,
      player_id: null
    });
  }

  // 3. Parent-level: branch+program+parent match, no player specified
  if (player.branch_id && player.parent_id) {
    scopeConditions.push({
      branch_id: player.branch_id,
      user_id: player.parent_id,
      player_id: null
    });
  }

  // 4. Player-level: specific player
  scopeConditions.push({
    player_id: player_id
  });

  if (scopeConditions.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const where = {
    status: 'active',
    [Op.or]: scopeConditions,
    [Op.and]: [
      {
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gte]: today } }
        ]
      }
    ]
  };

  // If pricing_plan_id provided, also match discounts with that plan or no plan
  if (pricing_plan_id) {
    where[Op.and].push({
      [Op.or]: [
        { pricing_plan_id: null },
        { pricing_plan_id: pricing_plan_id }
      ]
    });
  }

  console.log('🔍 Discount lookup for player:', player_id, 'pricing_plan:', pricing_plan_id);
  console.log('🔍 Player info:', { branch_id: player.branch_id, program_id: player.program_id, parent_id: player.parent_id });
  console.log('🔍 Scope conditions:', scopeConditions);
  console.log('🔍 Final where clause:', where);

  const discounts = await Discount.findAll({
    where,
    include: includeAssociations,
    order: [['discount_value', 'DESC']]
  });

  console.log('🔍 Found discounts:', discounts.length);

  res.json({
    success: true,
    data: discounts
  });
});
