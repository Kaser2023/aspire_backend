const { User, Branch, Player } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Private/Admin
 */
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, role, branch_id, is_active } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  // Build where clause
  const where = {};

  if (search) {
    where[Op.or] = [
      { first_name: { [Op.like]: `%${search}%` } },
      { last_name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } }
    ];
  }

  if (role) {
    where.role = role;
  }

  if (branch_id) {
    where.branch_id = branch_id;
  }

  if (is_active !== undefined) {
    where.is_active = is_active === 'true';
  }

  // Branch admins can only see users in their branch
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  const users = await User.findAndCountAll({
    where,
    include: [{ association: 'branch', attributes: ['id', 'name', 'code'] }],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']],
    attributes: { exclude: ['password', 'password_reset_token', 'password_reset_expires'] }
  });

  const response = formatPaginationResponse(users, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    include: [
      { association: 'branch' },
      { association: 'children' }
    ],
    attributes: { exclude: ['password', 'password_reset_token', 'password_reset_expires'] }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: user
  });
});

/**
 * @desc    Create new user
 * @route   POST /api/users
 * @access  Private/Admin
 */
exports.createUser = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, name_ar, phone, role, branch_id, permissions, programs, children } = req.body;

  // Check if user already exists (by email if provided, or by phone)
  if (email) {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }
  }

  // Check phone uniqueness
  if (phone) {
    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      throw new AppError('User with this phone number already exists', 400);
    }
  }

  // Normalize branch_id - treat empty strings as null
  const normalizedBranchId = branch_id && branch_id.trim() !== '' ? branch_id : null;

  // Validate branch_id if provided
  if (normalizedBranchId) {
    const branch = await Branch.findByPk(normalizedBranchId);
    if (!branch) {
      throw new AppError('Branch not found', 404);
    }
  }

  // Prepare user data
  const userData = {
    first_name,
    last_name,
    phone,
    role,
    branch_id: normalizedBranchId,
    is_verified: true, // Admin-created users are auto-verified
    is_active: true
  };

  // Add optional fields
  if (email) userData.email = email;
  if (password) userData.password = password;
  if (name_ar) userData.name_ar = name_ar;
  if (permissions) userData.permissions = permissions;

  const user = await User.create(userData);

  // If coach with programs, update the programs to assign this coach
  if (role === 'coach' && programs && programs.length > 0) {
    const { CoachProgram } = require('../models');
    
    // Create many-to-many relationships between coach and programs
    // Allow multiple coaches per program - no conflict checking needed
    await CoachProgram.bulkCreate(programs.map(programId => ({ 
      coach_id: user.id, 
      program_id: programId,
      is_primary: programs.length === 1 ? true : false // Make primary if only one program
    })), {
      ignoreDuplicates: true // Avoid duplicate assignments
    });
  }

  // Handle children connections for parents
  if (role === 'parent' && children && children.length > 0) {
    const { Player } = require('../models');
    
    // Update the players to connect them with this parent
    await Player.update(
      { parent_id: user.id },
      {
        where: {
          id: children,
          // Only update players that don't already have a parent or are updating to this parent
          [Op.or]: [
            { parent_id: null },
            { parent_id: user.id }
          ]
        }
      }
    );
  }

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role,
      branch_id: user.branch_id,
      is_active: user.is_active,
      permissions: user.permissions
    }
  });
});

/**
 * @desc    Update current user's profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const { first_name, last_name, phone, email } = req.body;

  // Check email uniqueness if changing
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError('Email already in use', 400);
    }
  }

  await user.update({
    first_name: first_name || user.first_name,
    last_name: last_name || user.last_name,
    phone: phone !== undefined ? phone : user.phone,
    email: email || user.email
  });

  // Sync profile between parent ↔ self-player accounts AND Player records
  try {
    if (user.account_type === 'parent') {
      const linkedPlayers = await Player.findAll({
        where: { parent_id: user.id, self_user_id: { [Op.ne]: null } }
      });
      for (const player of linkedPlayers) {
        await User.update(
          { first_name: user.first_name, last_name: user.last_name },
          { where: { id: player.self_user_id } }
        );
        await player.update({
          first_name: user.first_name,
          last_name: user.last_name
        });
      }
    } else if (user.account_type === 'self_player') {
      const playerRecord = await Player.findOne({
        where: { self_user_id: user.id }
      });
      if (playerRecord) {
        await playerRecord.update({
          first_name: user.first_name,
          last_name: user.last_name
        });
        if (playerRecord.parent_id !== user.id) {
          await User.update(
            { first_name: user.first_name, last_name: user.last_name },
            { where: { id: playerRecord.parent_id } }
          );
        }
      }
    }
  } catch (syncErr) {
    console.error('Profile sync error (non-blocking):', syncErr.message);
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const { email, first_name, last_name, name_ar, phone, role, branch_id, is_active, preferences, permissions, password, programs, children } = req.body;

  // Check email uniqueness if changing
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError('Email already in use', 400);
    }
  }

  // Prepare update data
  const updateData = {
    email: email || user.email,
    first_name: first_name || user.first_name,
    last_name: last_name || user.last_name,
    phone: phone !== undefined ? phone : user.phone,
    role: role || user.role,
    branch_id: branch_id !== undefined ? branch_id : user.branch_id,
    is_active: is_active !== undefined ? is_active : user.is_active,
    preferences: preferences || user.preferences
  };

  // Add name_ar if provided
  if (name_ar !== undefined) {
    updateData.name_ar = name_ar;
  }

  // Add permissions if provided (for super_admin users)
  if (permissions !== undefined) {
    updateData.permissions = permissions;
  }

  // Update password if provided (password reset by admin)
  if (password && password.length >= 6) {
    updateData.password = password;
  }

  await user.update(updateData);

  // Handle program assignments for coaches
  if (programs !== undefined && ((role || user.role) === 'coach')) {
    const { CoachProgram } = require('../models');
    
    // Remove existing program assignments
    await CoachProgram.destroy({
      where: { coach_id: user.id }
    });
    
    // Add new program assignments if provided
    if (programs && programs.length > 0) {
      // Create new assignments - allow multiple coaches per program
      await CoachProgram.bulkCreate(programs.map(programId => ({ 
        coach_id: user.id, 
        program_id: programId,
        is_primary: programs.length === 1 ? true : false // Make primary if only one program
      })), {
        ignoreDuplicates: true // Avoid duplicate assignments
      });
    }
  }

  // Handle children connections for parents
  if (children !== undefined && ((role || user.role) === 'parent')) {
    const { Player } = require('../models');
    
    console.log('🔧 Parent Update Debug:', {
      userId: user.id,
      userEmail: user.email,
      newChildren: children,
      childrenArray: Array.isArray(children) ? children : 'not array'
    });
    
    // Get all current children of this parent
    const currentChildren = await Player.findAll({
      where: { parent_id: user.id },
      attributes: ['id']
    });
    const currentChildIds = currentChildren.map(child => child.id);
    
    console.log('📋 Current Children:', currentChildIds);
    
    // Find children to remove (current children that are not in the new selection)
    const childrenToRemove = currentChildIds.filter(id => !children.includes(id));
    
    // Find children to add (new selection that are not already assigned to this parent)
    const childrenToAdd = children.filter(id => !currentChildIds.includes(id));
    
    console.log('🔄 Children Operations:', {
      toRemove: childrenToRemove,
      toAdd: childrenToAdd
    });
    
    // Remove children by setting their parent_id to a special "unassigned" parent
    if (childrenToRemove.length > 0) {
      console.log('🗑️ Removing children:', childrenToRemove);
      
      // Find or create an "unassigned" parent record
      const { User } = require('../models');
      let unassignedParent = await User.findOne({
        where: { 
          email: 'unassigned@system.local',
          role: 'parent'
        }
      });
      
      if (!unassignedParent) {
        console.log('👤 Creating unassigned parent...');
        unassignedParent = await User.create({
          email: 'unassigned@system.local',
          phone: '0000000000',
          first_name: 'Unassigned',
          last_name: 'Parent',
          role: 'parent',
          is_active: false,
          is_verified: true
        });
        console.log('✅ Unassigned parent created:', unassignedParent.id);
      } else {
        console.log('✅ Found existing unassigned parent:', unassignedParent.id);
      }
      
      // Move children to unassigned parent
      const updateResult = await Player.update(
        { parent_id: unassignedParent.id },
        { where: { id: childrenToRemove } }
      );
      
      console.log('📊 Update result:', updateResult);
    }
    
    // Add new children to this parent
    if (childrenToAdd.length > 0) {
      console.log('➕ Adding children:', childrenToAdd);
      const updateResult = await Player.update(
        { parent_id: user.id },
        { where: { id: childrenToAdd } }
      );
      console.log('📊 Add result:', updateResult);
    }
  }

  // Reload user to get updated data (excluding password)
  await user.reload();

  res.json({
    success: true,
    message: 'User updated successfully',
    data: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role,
      branch_id: user.branch_id,
      is_active: user.is_active,
      permissions: user.permissions
    }
  });
});

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Prevent deleting owner accounts
  if (user.role === ROLES.OWNER) {
    throw new AppError('Cannot delete owner accounts', 403);
  }

  // Hard delete - permanently remove from database
  await user.destroy();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

/**
 * @desc    Upload user avatar
 * @route   POST /api/users/:id/avatar
 * @access  Private
 */
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please upload an image file', 400);
  }

  const user = await User.findByPk(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check permission
  if (req.user.id !== user.id && ![ROLES.SUPER_ADMIN, ROLES.OWNER].includes(req.user.role)) {
    throw new AppError('Not authorized to update this user', 403);
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  await user.update({ avatar: avatarUrl });

  res.json({
    success: true,
    message: 'Avatar uploaded successfully',
    data: { avatar: avatarUrl }
  });
});

/**
 * @desc    Get users by role
 * @route   GET /api/users/role/:role
 * @access  Private/Admin
 */
exports.getUsersByRole = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = { role };

  // Exclude the unassigned parent and self-player accounts from the parents list
  if (role === 'parent') {
    where[Op.and] = [
      { [Op.or]: [
        { email: { [Op.ne]: 'unassigned@system.local' } },
        { email: { [Op.is]: null } }
      ]},
      { account_type: 'parent' } // Exclude self_player accounts from "Registered Accounts"
    ];
  }

  // Branch admins: filter by branch association (not just User.branch_id)
  const branchFilter = req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id
    ? req.user.branch_id
    : (req.query.branch_id || null);

  if (branchFilter) {
    if (role === 'coach') {
      // Coaches are linked to branches via programs (CoachProgram → Program)
      // Find coach IDs that have programs in this branch
      const { CoachProgram, Program: ProgramModel } = require('../models');
      const branchPrograms = await ProgramModel.findAll({
        where: { branch_id: branchFilter },
        attributes: ['id']
      });
      const programIds = branchPrograms.map(p => p.id);
      if (programIds.length > 0) {
        const coachAssignments = await CoachProgram.findAll({
          where: { program_id: { [Op.in]: programIds } },
          attributes: ['coach_id']
        });
        const coachIds = [...new Set(coachAssignments.map(ca => ca.coach_id))];
        if (coachIds.length > 0) {
          where.id = { [Op.in]: coachIds };
        } else {
          where.id = null; // No coaches in this branch
        }
      } else {
        where.id = null;
      }
    } else if (role === 'parent') {
      // Parents are linked via their children's branch_id
      const branchPlayers = await Player.findAll({
        where: { branch_id: branchFilter },
        attributes: ['parent_id']
      });
      const parentIds = [...new Set(branchPlayers.map(p => p.parent_id).filter(Boolean))];
      if (parentIds.length > 0) {
        where[Op.or] = [
          ...(where[Op.or] || []),
          { id: { [Op.in]: parentIds } },
          { branch_id: branchFilter }
        ];
        // Merge with existing Op.and if present
        if (where[Op.and]) {
          const existingAnd = where[Op.and];
          delete where[Op.and];
          where[Op.and] = [
            ...existingAnd,
            { [Op.or]: [{ id: { [Op.in]: parentIds } }, { branch_id: branchFilter }] }
          ];
          delete where[Op.or];
        }
      } else {
        where.branch_id = branchFilter;
      }
    } else {
      where.branch_id = branchFilter;
    }
  }

  const users = await User.findAndCountAll({
    where,
    include: [
      { association: 'branch', attributes: ['id', 'name'] },
      ...(role === 'coach' ? [{
        association: 'programs',
        attributes: ['id', 'name', 'name_ar'],
        required: false,
        through: { attributes: [] }
      }] : []),
      ...(role === 'parent' ? [{
        association: 'children',
        attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar'],
        required: false,
        include: [
          { association: 'branch', attributes: ['id', 'name'] }
        ]
      }] : [])
    ],
    distinct: true,
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']],
    attributes: { exclude: ['password', 'password_reset_token', 'password_reset_expires'] }
  });

  console.log('📊 getUsersByRole Result:', {
    count: users.count,
    rows: users.rows.length,
    firstUser: users.rows[0] ? {
      id: users.rows[0].id,
      role: users.rows[0].role,
      email: users.rows[0].email
    } : null
  });

  const response = formatPaginationResponse(users, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get users by branch
 * @route   GET /api/users/branch/:branchId
 * @access  Private/Admin
 */
exports.getUsersByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { page = 1, limit = 10, role } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = { branch_id: branchId };
  if (role) where.role = role;

  const users = await User.findAndCountAll({
    where,
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']],
    attributes: { exclude: ['password', 'password_reset_token', 'password_reset_expires'] }
  });

  const response = formatPaginationResponse(users, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Toggle user status (activate/deactivate)
 * @route   PATCH /api/users/:id/status
 * @access  Private/Admin
 */
exports.toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === ROLES.OWNER) {
    throw new AppError('Cannot change owner account status', 403);
  }

  await user.update({ is_active: !user.is_active });

  res.json({
    success: true,
    message: `User ${user.is_active ? 'activated' : 'deactivated'} successfully`,
    data: { is_active: user.is_active }
  });
});

/**
 * @desc    Get users organized by branch and role for audience selector
 * @route   GET /api/users/audience-tree
 * @access  Private/Admin
 */
exports.getAudienceTree = asyncHandler(async (req, res) => {
  const { search } = req.query;

  // Get all branches
  const branches = await Branch.findAll({
    where: { is_active: true },
    attributes: ['id', 'name', 'name_ar', 'code'],
    order: [['name', 'ASC']]
  });

  // Get all active users with their branch info
  const whereClause = { is_active: true };
  if (search) {
    whereClause[Op.or] = [
      { first_name: { [Op.like]: `%${search}%` } },
      { last_name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { phone: { [Op.like]: `%${search}%` } },
      { name_ar: { [Op.like]: `%${search}%` } }
    ];
  }

  const users = await User.findAll({
    where: whereClause,
    attributes: ['id', 'first_name', 'last_name', 'name_ar', 'email', 'phone', 'role', 'branch_id', 'avatar'],
    order: [['first_name', 'ASC'], ['last_name', 'ASC']]
  });

  // Get players (they are separate from users)
  const playerWhereClause = { status: 'active' };
  if (search) {
    playerWhereClause[Op.or] = [
      { first_name: { [Op.like]: `%${search}%` } },
      { last_name: { [Op.like]: `%${search}%` } },
      { first_name_ar: { [Op.like]: `%${search}%` } },
      { last_name_ar: { [Op.like]: `%${search}%` } }
    ];
  }

  const players = await Player.findAll({
    where: playerWhereClause,
    attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'avatar', 'branch_id', 'parent_id', 'emergency_contact_phone'],
    include: [{
      model: User,
      as: 'parent',
      attributes: ['id', 'phone'],
      required: false
    }],
    order: [['first_name', 'ASC'], ['last_name', 'ASC']]
  });

  // Organize users by role for "All by Role" option
  const roleGroups = {
    branch_admin: users.filter(u => u.role === 'branch_admin'),
    coach: users.filter(u => u.role === 'coach'),
    accountant: users.filter(u => u.role === 'accountant'),
    parent: users.filter(u => u.role === 'parent'),
    player: players
  };

  // Get parents associated with each branch through their players
  const parentPlayerMap = new Map(); // parent_id -> Set of branch_ids
  for (const player of players) {
    if (player.parent_id && player.branch_id) {
      if (!parentPlayerMap.has(player.parent_id)) {
        parentPlayerMap.set(player.parent_id, new Set());
      }
      parentPlayerMap.get(player.parent_id).add(player.branch_id);
    }
  }

  // Organize by branch
  const branchTree = branches.map(branch => {
    const branchUsers = users.filter(u => u.branch_id === branch.id);
    const branchPlayers = players.filter(p => p.branch_id === branch.id);
    
    // Get parents for this branch (either directly assigned or through their players)
    const branchParents = users.filter(u => {
      if (u.role !== 'parent') return false;
      // Check if parent is directly assigned to this branch
      if (u.branch_id === branch.id) return true;
      // Check if parent has players in this branch
      const parentBranches = parentPlayerMap.get(u.id);
      return parentBranches && parentBranches.has(branch.id);
    });

    return {
      id: branch.id,
      name: branch.name,
      name_ar: branch.name_ar,
      code: branch.code,
      groups: {
        branch_admin: branchUsers.filter(u => u.role === 'branch_admin').map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          avatar: u.avatar
        })),
        coach: branchUsers.filter(u => u.role === 'coach').map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          avatar: u.avatar
        })),
        accountant: branchUsers.filter(u => u.role === 'accountant').map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          avatar: u.avatar
        })),
        parent: branchParents.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          phone: u.phone,
          avatar: u.avatar
        })),
        player: branchPlayers.map(p => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          name_ar: p.first_name_ar ? `${p.first_name_ar} ${p.last_name_ar || ''}`.trim() : null,
          avatar: p.avatar,
          phone: p.emergency_contact_phone || null,
          parent_phone: p.parent?.phone || null,
          isPlayer: true
        }))
      }
    };
  });

  // Count totals for each role
  const roleCounts = {
    branch_admin: roleGroups.branch_admin.length,
    coach: roleGroups.coach.length,
    accountant: roleGroups.accountant.length,
    parent: roleGroups.parent.length,
    player: roleGroups.player.length
  };

  res.json({
    success: true,
    data: {
      roleCounts,
      roleGroups: {
        branch_admin: roleGroups.branch_admin.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          avatar: u.avatar
        })),
        coach: roleGroups.coach.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          avatar: u.avatar
        })),
        accountant: roleGroups.accountant.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          avatar: u.avatar
        })),
        parent: roleGroups.parent.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          name_ar: u.name_ar,
          email: u.email,
          phone: u.phone,
          avatar: u.avatar
        })),
        player: roleGroups.player.map(p => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          name_ar: p.first_name_ar ? `${p.first_name_ar} ${p.last_name_ar || ''}`.trim() : null,
          avatar: p.avatar,
          phone: p.emergency_contact_phone || null,
          parent_phone: p.parent?.phone || null,
          isPlayer: true
        }))
      },
      branches: branchTree
    }
  });
});

