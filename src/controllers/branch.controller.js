const { Branch, User, Program, Player } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');

/**
 * @desc    Get public branches (for landing page)
 * @route   GET /api/branches/public
 * @access  Public
 */
exports.getPublicBranches = asyncHandler(async (req, res) => {
  const branches = await Branch.findAll({
    where: { is_active: true },
    attributes: ['id', 'name', 'name_ar', 'city', 'region', 'address', 'phone', 'facilities', 'working_hours'],
    order: [['name', 'ASC']]
  });

  res.json({
    success: true,
    data: branches
  });
});

/**
 * @desc    Get all branches
 * @route   GET /api/branches
 * @access  Private
 */
exports.getAllBranches = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, city, is_active } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { name_ar: { [Op.like]: `%${search}%` } },
      { code: { [Op.like]: `%${search}%` } }
    ];
  }

  if (city) where.city = city;
  // By default, only show active branches. Show inactive only if explicitly requested.
  if (is_active !== undefined) {
    where.is_active = is_active === 'true';
  } else {
    where.is_active = true;
  }

  console.log('🔍 Fetching branches with where:', where);

  const branches = await Branch.findAndCountAll({
    where,
    include: [
      { association: 'manager', attributes: ['id', 'first_name', 'last_name', 'email'] }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  console.log('📊 Found branches:', branches.rows.length);

  // Add coach and player counts for each branch
  const branchesWithCounts = await Promise.all(
    branches.rows.map(async (branch) => {
      try {
        const coachCount = await User.count({
          where: { 
            branch_id: branch.id, 
            role: ROLES.COACH,
            is_active: true
          }
        });

        const playerCount = await Player.count({
          where: { 
            branch_id: branch.id,
            status: 'active'
          }
        });

        const programCount = await Program.count({
          where: { 
            branch_id: branch.id,
            is_active: true
          }
        });

        console.log(`🏢 Branch ${branch.id}: ${coachCount} coaches, ${playerCount} players, ${programCount} programs`);

        return {
          ...branch.toJSON(),
          coach_count: coachCount,
          player_count: playerCount,
          program_count: programCount
        };
      } catch (error) {
        console.error(`❌ Error counting for branch ${branch.id}:`, error);
        return {
          ...branch.toJSON(),
          coach_count: 0,
          player_count: 0,
          program_count: 0
        };
      }
    })
  );

  const response = formatPaginationResponse(
    { ...branches, rows: branchesWithCounts },
    page,
    limit
  );

  console.log('✅ Final response data count:', response.data?.length);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get branch by ID
 * @route   GET /api/branches/:id
 * @access  Private
 */
exports.getBranchById = asyncHandler(async (req, res) => {
  const branch = await Branch.findByPk(req.params.id, {
    include: [
      { association: 'manager', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] },
      { association: 'programs', where: { is_active: true }, required: false },
      { 
        association: 'staff', 
        where: { role: { [Op.in]: [ROLES.COACH, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT] } },
        required: false,
        attributes: ['id', 'first_name', 'last_name', 'role', 'email']
      }
    ]
  });

  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  res.json({
    success: true,
    data: branch
  });
});

/**
 * @desc    Create new branch
 * @route   POST /api/branches
 * @access  Private/Admin
 */
exports.createBranch = asyncHandler(async (req, res) => {
  const { name, name_ar, code, address, city, region, phone, email, manager_id, capacity, facilities, working_hours, latitude, longitude } = req.body;

  // Validate required field
  if (!name) {
    throw new AppError('Branch name is required', 400);
  }

  // Auto-generate code if not provided
  let branchCode = code;
  if (!branchCode) {
    // Generate code from name: take first 3 letters uppercase + random 3 digits
    const prefix = name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'BR';
    const randomNum = Math.floor(100 + Math.random() * 900);
    branchCode = `${prefix}${randomNum}`;
  }

  // Check if code already exists, and regenerate if needed
  let existingBranch = await Branch.findOne({ where: { code: branchCode } });
  let attempts = 0;
  while (existingBranch && attempts < 10) {
    const prefix = name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'BR';
    const randomNum = Math.floor(100 + Math.random() * 900);
    branchCode = `${prefix}${randomNum}`;
    existingBranch = await Branch.findOne({ where: { code: branchCode } });
    attempts++;
  }

  if (existingBranch) {
    throw new AppError('Could not generate unique branch code. Please provide one manually.', 400);
  }

  // Normalize manager_id - treat empty strings as null
  const normalizedManagerId = manager_id && manager_id.trim() !== '' ? manager_id : null;

  // Validate manager if provided
  if (normalizedManagerId) {
    const manager = await User.findByPk(normalizedManagerId);
    if (!manager) {
      throw new AppError('Manager not found', 404);
    }
    if (![ROLES.BRANCH_ADMIN, ROLES.SUPER_ADMIN].includes(manager.role)) {
      throw new AppError('User must be a branch admin or higher to manage a branch', 400);
    }
  }

  const branch = await Branch.create({
    name,
    name_ar,
    code: branchCode,
    address,
    city,
    region,
    phone,
    email,
    manager_id: normalizedManagerId,
    capacity,
    facilities,
    working_hours,
    latitude,
    longitude
  });

  // Update manager's branch_id
  if (normalizedManagerId) {
    await User.update({ branch_id: branch.id }, { where: { id: normalizedManagerId } });
  }

  res.status(201).json({
    success: true,
    message: 'Branch created successfully',
    data: branch
  });
});

/**
 * @desc    Update branch
 * @route   PUT /api/branches/:id
 * @access  Private/Admin
 */
exports.updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findByPk(req.params.id);

  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  // Check code uniqueness if changing
  if (req.body.code && req.body.code !== branch.code) {
    const existingBranch = await Branch.findOne({ where: { code: req.body.code } });
    if (existingBranch) {
      throw new AppError('Branch code already exists', 400);
    }
  }

  await branch.update(req.body);

  res.json({
    success: true,
    message: 'Branch updated successfully',
    data: branch
  });
});

/**
 * @desc    Delete branch
 * @route   DELETE /api/branches/:id
 * @access  Private/Admin
 */
exports.deleteBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findByPk(req.params.id);

  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  // Check if branch has active players
  const playersCount = await Player.count({ where: { branch_id: branch.id, status: 'active' } });
  if (playersCount > 0) {
    throw new AppError('Cannot delete branch with active players', 400);
  }

  // Soft delete
  await branch.update({ is_active: false });

  res.json({
    success: true,
    message: 'Branch deleted successfully'
  });
});

/**
 * @desc    Get branch programs
 * @route   GET /api/branches/:id/programs
 * @access  Private
 */
exports.getBranchPrograms = asyncHandler(async (req, res) => {
  const programs = await Program.findAll({
    where: { branch_id: req.params.id, is_active: true },
    include: [
      { association: 'coach', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['name', 'ASC']]
  });

  res.json({
    success: true,
    data: programs
  });
});

/**
 * @desc    Get branch players
 * @route   GET /api/branches/:id/players
 * @access  Private/Admin
 */
exports.getBranchPlayers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status = 'active' } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const players = await Player.findAndCountAll({
    where: { branch_id: req.params.id, status },
    include: [
      { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] },
      { association: 'program', attributes: ['id', 'name'] }
    ],
    offset,
    limit: limitNum,
    order: [['first_name', 'ASC']]
  });

  const response = formatPaginationResponse(players, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get branch staff
 * @route   GET /api/branches/:id/staff
 * @access  Private/Admin
 */
exports.getBranchStaff = asyncHandler(async (req, res) => {
  const staff = await User.findAll({
    where: {
      branch_id: req.params.id,
      role: { [Op.in]: [ROLES.COACH, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT] },
      is_active: true
    },
    attributes: { exclude: ['password', 'password_reset_token', 'password_reset_expires'] },
    order: [['role', 'ASC'], ['first_name', 'ASC']]
  });

  res.json({
    success: true,
    data: staff
  });
});

/**
 * @desc    Assign manager to branch
 * @route   POST /api/branches/:id/assign-manager
 * @access  Private/Admin
 */
exports.assignManager = asyncHandler(async (req, res) => {
  const { manager_id } = req.body;

  const branch = await Branch.findByPk(req.params.id);
  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  const manager = await User.findByPk(manager_id);
  if (!manager) {
    throw new AppError('User not found', 404);
  }

  // Update old manager's branch_id if exists
  if (branch.manager_id) {
    await User.update({ branch_id: null }, { where: { id: branch.manager_id } });
  }

  // Update branch and new manager
  await branch.update({ manager_id });
  await manager.update({ branch_id: branch.id, role: ROLES.BRANCH_ADMIN });

  res.json({
    success: true,
    message: 'Manager assigned successfully',
    data: branch
  });
});

/**
 * @desc    Toggle branch status
 * @route   PATCH /api/branches/:id/status
 * @access  Private/Admin
 */
exports.toggleBranchStatus = asyncHandler(async (req, res) => {
  const branch = await Branch.findByPk(req.params.id);

  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  await branch.update({ is_active: !branch.is_active });

  res.json({
    success: true,
    message: `Branch ${branch.is_active ? 'activated' : 'deactivated'} successfully`,
    data: { is_active: branch.is_active }
  });
});

/**
 * @desc    Get branch statistics
 * @route   GET /api/branches/stats
 * @access  Private/Admin
 */
exports.getBranchStats = asyncHandler(async (req, res) => {
  const branches = await Branch.findAll({
    where: { is_active: true },
    include: [
      {
        association: 'players',
        where: { status: 'active' },
        required: false,
        attributes: []
      },
      {
        association: 'programs',
        where: { is_active: true },
        required: false,
        attributes: []
      }
    ],
    attributes: [
      'id', 'name', 'code', 'city',
      [require('sequelize').fn('COUNT', require('sequelize').fn('DISTINCT', require('sequelize').col('players.id'))), 'players_count'],
      [require('sequelize').fn('COUNT', require('sequelize').fn('DISTINCT', require('sequelize').col('programs.id'))), 'programs_count']
    ],
    group: ['Branch.id']
  });

  const totalBranches = await Branch.count({ where: { is_active: true } });
  const totalPlayers = await Player.count({ where: { status: 'active' } });
  const totalPrograms = await Program.count({ where: { is_active: true } });

  res.json({
    success: true,
    data: {
      summary: {
        totalBranches,
        totalPlayers,
        totalPrograms
      },
      branches
    }
  });
});

