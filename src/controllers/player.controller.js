const { Player, User, Branch, Program, Subscription, Attendance } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES, PLAYER_STATUS } = require('../config/constants');
const NotificationService = require('../services/notification.service');
const { emitNotification } = require('../socket');

/**
 * @desc    Get all players
 * @route   GET /api/players
 * @access  Private
 */
exports.getAllPlayers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, branch_id, program_id, status, parent_id, assignment_status } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  // Build where clause
  const where = {};

  if (search) {
    where[Op.or] = [
      { first_name: { [Op.like]: `%${search}%` } },
      { last_name: { [Op.like]: `%${search}%` } },
      { registration_number: { [Op.like]: `%${search}%` } }
    ];
  }

  if (branch_id) where.branch_id = branch_id;
  if (program_id) where.program_id = program_id;
  if (status) where.status = status;
  if (parent_id) where.parent_id = parent_id;

  if (assignment_status === 'assigned') {
    where.program_id = { [Op.ne]: null };
    where.coach_id = { [Op.ne]: null };
  } else if (assignment_status === 'unassigned') {
    where[Op.or] = [
      { program_id: { [Op.is]: null } },
      { coach_id: { [Op.is]: null } }
    ];
  }

  // Additional filtering based on coach_id query parameter
  if (req.query.coach_id) {
    where.coach_id = req.query.coach_id;
  }

  // Role-based filtering
  if (req.user.role === ROLES.PARENT) {
    // Remove query-param parent_id to avoid conflicting with the OR filter below
    // (e.g., a self-player whose player record has parent_id pointing to a real parent)
    delete where.parent_id;
    // For self-players and parents: show players where parent_id OR self_user_id matches
    where[Op.or] = [
      { parent_id: req.user.id },
      { self_user_id: req.user.id }
    ];
  } else if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  } else if (req.user.role === ROLES.COACH) {
    // Coaches see players directly assigned to them via coach_id
    where.coach_id = req.user.id;
  }

  const players = await Player.findAndCountAll({
    where,
    include: [
      { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'name_ar', 'email', 'phone'] },
      { association: 'selfUser', attributes: ['id', 'first_name', 'last_name', 'phone', 'account_type'] },
      { association: 'branch', attributes: ['id', 'name', 'name_ar', 'code'] },
      { association: 'program', attributes: ['id', 'name', 'name_ar', 'type'] },
      { association: 'coach', attributes: ['id', 'first_name', 'last_name', 'name_ar'] }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  // Format the response to include flattened program_name
  const formattedPlayers = {
    count: players.count,
    rows: players.rows.map(player => {
      const playerData = player.toJSON();
      return {
        ...playerData,
        program_name: playerData.program?.name || null,
        program_name_ar: playerData.program?.name_ar || null,
        branch_name: playerData.branch?.name || null,
        parent_name: playerData.parent ? `${playerData.parent.first_name} ${playerData.parent.last_name}` : null,
        coach_name: playerData.coach ? `${playerData.coach.first_name} ${playerData.coach.last_name}` : null
      };
    })
  };

  const response = formatPaginationResponse(formattedPlayers, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get player by ID
 * @route   GET /api/players/:id
 * @access  Private
 */
exports.getPlayerById = asyncHandler(async (req, res) => {
  const player = await Player.findByPk(req.params.id, {
    include: [
      { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'email', 'phone'] },
      { association: 'branch' },
      { association: 'program' },
      { association: 'subscriptions', limit: 5, order: [['created_at', 'DESC']] }
    ]
  });

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to view this player', 403);
  }

  res.json({
    success: true,
    data: player
  });
});

/**
 * @desc    Create new player
 * @route   POST /api/players
 * @access  Private
 */
exports.createPlayer = asyncHandler(async (req, res) => {
  const {
    first_name, last_name, first_name_ar, last_name_ar,
    date_of_birth, gender, national_id, nationality, address, branch_id, program_id, coach_id,
    medical_notes, allergies, emergency_contact_name,
    emergency_contact_phone, emergency_contact_relation,
    school_name, grade_level, jersey_size, shoe_size, position, skill_level
  } = req.body;

  // Validate branch exists
  const branch = await Branch.findByPk(branch_id);
  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  // Validate program if provided
  if (program_id) {
    const program = await Program.findByPk(program_id);
    if (!program) {
      throw new AppError('Program not found', 404);
    }
    if (program.branch_id !== branch_id) {
      throw new AppError('Program does not belong to selected branch', 400);
    }
  }

  // Validate coach if provided
  if (coach_id) {
    const { User } = require('../models');
    const coach = await User.findByPk(coach_id);
    if (!coach) {
      throw new AppError('Coach not found', 404);
    }
    if (coach.role !== ROLES.COACH) {
      throw new AppError('Selected user is not a coach', 400);
    }
    
    // If coach is assigned, validate they're assigned to the program
    if (program_id) {
      const { CoachProgram } = require('../models');
      const assignment = await CoachProgram.findOne({
        where: { coach_id, program_id }
      });
      if (!assignment) {
        throw new AppError('Coach is not assigned to this program', 400);
      }
    }
  }

  // Determine parent_id
  let parent_id = req.user.id;
  if ([ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN].includes(req.user.role) && req.body.parent_id) {
    parent_id = req.body.parent_id;
  }

  const player = await Player.create({
    first_name,
    last_name,
    first_name_ar,
    last_name_ar,
    date_of_birth,
    gender,
    national_id,
    nationality,
    address,
    parent_id,
    branch_id,
    program_id,
    coach_id,
    medical_notes,
    allergies,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relation,
    school_name,
    grade_level,
    jersey_size,
    shoe_size,
    position,
    skill_level
  });

  // Update program enrollment count
  if (program_id) {
    await Program.increment('current_enrollment', { where: { id: program_id } });
  }

  // Notify Super Admins and Branch Admins about new player registration
  try {
    const parentUser = await User.findByPk(parent_id, { attributes: ['first_name', 'last_name'] });
    const parentName = parentUser ? `${parentUser.first_name} ${parentUser.last_name}` : null;

    await NotificationService.notifyNewRegistration(player, branch, parentName);

    // Emit real-time socket notification
    emitNotification({
      data: {
        type: 'new_registration',
        player_id: player.id,
        player_name: `${first_name} ${last_name}`,
        parent_name: parentName,
        branch_id: branch.id,
        branch_name: branch.name
      },
      roles: ['super_admin', 'owner', 'branch_admin'],
      branchId: branch.id
    });
  } catch (notifError) {
    console.error('Failed to send new registration notification:', notifError);
    // Don't fail the request if notification fails
  }

  res.status(201).json({
    success: true,
    message: 'Player registered successfully',
    data: player
  });
});

/**
 * @desc    Update player
 * @route   PUT /api/players/:id
 * @access  Private
 */
exports.updatePlayer = asyncHandler(async (req, res) => {
  const player = await Player.findByPk(req.params.id);

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to update this player', 403);
  }
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id || String(player.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Not authorized to update this player', 403);
    }
    if (req.body.branch_id && String(req.body.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Branch admin can only update players in their own branch', 403);
    }
  }

  // Resolve intended target program/coach after update
  const nextProgramId = req.body.program_id !== undefined ? req.body.program_id : player.program_id;
  const nextCoachId = req.body.coach_id !== undefined ? req.body.coach_id : player.coach_id;

  // Validate program if provided
  if (nextProgramId) {
    const program = await Program.findByPk(nextProgramId);
    if (!program) {
      throw new AppError('Program not found', 404);
    }
    if (req.user.role === ROLES.BRANCH_ADMIN && String(program.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Program does not belong to your branch', 403);
    }
  }

  // Validate coach if provided
  if (nextCoachId) {
    const coach = await User.findByPk(nextCoachId);
    if (!coach) {
      throw new AppError('Coach not found', 404);
    }
    if (coach.role !== ROLES.COACH) {
      throw new AppError('Selected user is not a coach', 400);
    }
    if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
      // Branch-admin context uses program assignments for coach branch membership.
      const { CoachProgram } = require('../models');
      const coachProgram = await CoachProgram.findOne({
        where: { coach_id: nextCoachId },
        include: [{ model: Program, as: 'program', attributes: ['id', 'branch_id'], required: true }]
      });
      if (!coachProgram) {
        throw new AppError('Coach is not assigned to any program', 400);
      }
    }

    // If both program and coach are provided, ensure coach is assigned to the program
    if (nextProgramId) {
      const { CoachProgram } = require('../models');
      const assignment = await CoachProgram.findOne({
        where: { coach_id: nextCoachId, program_id: nextProgramId }
      });
      if (!assignment) {
        throw new AppError('Coach is not assigned to this program', 400);
      }
    }
  }

  // Track program change for enrollment update
  const oldProgramId = player.program_id;

  await player.update(req.body);

  // Update enrollment counts if program changed
  if (req.body.program_id !== undefined && req.body.program_id !== oldProgramId) {
    if (oldProgramId) {
      await Program.decrement('current_enrollment', { where: { id: oldProgramId } });
    }
    if (req.body.program_id) {
      await Program.increment('current_enrollment', { where: { id: req.body.program_id } });
    }
  }

  // Sync name to linked self-player User account when Player name changes
  if ((req.body.first_name || req.body.last_name) && player.self_user_id) {
    try {
      await User.update(
        {
          ...(req.body.first_name && { first_name: player.first_name }),
          ...(req.body.last_name && { last_name: player.last_name })
        },
        { where: { id: player.self_user_id } }
      );
    } catch (syncErr) {
      console.error('Player→User name sync error (non-blocking):', syncErr.message);
    }
  }

  res.json({
    success: true,
    message: 'Player updated successfully',
    data: player
  });
});

/**
 * @desc    Delete player
 * @route   DELETE /api/players/:id
 * @access  Private/Admin
 */
exports.deletePlayer = asyncHandler(async (req, res) => {
  const player = await Player.findByPk(req.params.id);

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Branch admins can only delete players in their branch.
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id || String(player.branch_id) !== String(req.user.branch_id)) {
      throw new AppError('Not authorized to delete this player', 403);
    }
  }

  try {
    // Update enrollment count before hard delete.
    if (player.program_id) {
      await Program.decrement('current_enrollment', { where: { id: player.program_id } });
    }

    // Hard delete - permanently remove from database.
    await player.destroy();

    return res.json({
      success: true,
      message: 'Player deleted successfully'
    });
  } catch (err) {
    // If related records (payments/subscriptions/attendance) prevent hard delete,
    // archive player instead of failing the request.
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      await player.update({
        status: 'inactive',
        program_id: null,
        coach_id: null
      });

      return res.json({
        success: true,
        message: 'Player has related records and was archived instead of permanent deletion',
        data: { archived: true }
      });
    }

    throw err;
  }
});

/**
 * @desc    Upload player avatar
 * @route   POST /api/players/:id/avatar
 * @access  Private
 */
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please upload an image file', 400);
  }

  const player = await Player.findByPk(req.params.id);

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to update this player', 403);
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  await player.update({ avatar: avatarUrl });

  res.json({
    success: true,
    message: 'Avatar uploaded successfully',
    data: { avatar: avatarUrl }
  });
});

/**
 * @desc    Upload player ID document
 * @route   POST /api/players/:id/id-document
 * @access  Private
 */
exports.uploadIdDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please upload a document file', 400);
  }

  const player = await Player.findByPk(req.params.id);

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to update this player', 403);
  }

  const documentUrl = `/uploads/documents/${req.file.filename}`;
  await player.update({ id_document: documentUrl });

  res.json({
    success: true,
    message: 'ID document uploaded successfully',
    data: { id_document: documentUrl }
  });
});

/**
 * @desc    Get players by parent
 * @route   GET /api/players/parent/:parentId
 * @access  Private
 */
exports.getPlayersByParent = asyncHandler(async (req, res) => {
  const { parentId } = req.params;

  // Check access
  if (req.user.role === ROLES.PARENT && req.user.id !== parentId) {
    throw new AppError('Not authorized to view these players', 403);
  }

  // For self-players: also find players where self_user_id matches
  // For parents: find players where parent_id matches
  const whereClause = {
    [Op.or]: [
      { parent_id: parentId },
      { self_user_id: parentId }
    ]
  };

  const players = await Player.findAll({
    where: whereClause,
    include: [
      { association: 'branch', attributes: ['id', 'name'] },
      { association: 'program', attributes: ['id', 'name', 'type'] }
    ],
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: players
  });
});

/**
 * @desc    Get players by branch
 * @route   GET /api/players/branch/:branchId
 * @access  Private/Admin
 */
exports.getPlayersByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { page = 1, limit = 20, status } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = { branch_id: branchId };
  if (status) where.status = status;

  const players = await Player.findAndCountAll({
    where,
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
 * @desc    Get players by program
 * @route   GET /api/players/program/:programId
 * @access  Private/Admin/Coach
 */
exports.getPlayersByProgram = asyncHandler(async (req, res) => {
  const { programId } = req.params;

  const players = await Player.findAll({
    where: { program_id: programId, status: PLAYER_STATUS.ACTIVE },
    include: [
      { association: 'parent', attributes: ['id', 'first_name', 'last_name', 'phone'] }
    ],
    order: [['first_name', 'ASC']]
  });

  res.json({
    success: true,
    data: players
  });
});

/**
 * @desc    Update player status
 * @route   PATCH /api/players/:id/status
 * @access  Private/Admin
 */
exports.updatePlayerStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  const player = await Player.findByPk(req.params.id);

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  await player.update({ status });

  res.json({
    success: true,
    message: 'Player status updated successfully',
    data: { status: player.status }
  });
});

/**
 * @desc    Assign player to program
 * @route   POST /api/players/:id/assign-program
 * @access  Private/Admin
 */
exports.assignToProgram = asyncHandler(async (req, res) => {
  const { program_id } = req.body;

  const player = await Player.findByPk(req.params.id);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  const program = await Program.findByPk(program_id);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  // Check capacity
  if (program.capacity && program.current_enrollment >= program.capacity) {
    throw new AppError('Program is at full capacity', 400);
  }

  // Update enrollment counts
  if (player.program_id) {
    await Program.decrement('current_enrollment', { where: { id: player.program_id } });
  }
  await Program.increment('current_enrollment', { where: { id: program_id } });

  await player.update({ program_id, branch_id: program.branch_id });

  res.json({
    success: true,
    message: 'Player assigned to program successfully',
    data: player
  });
});

/**
 * @desc    Get player statistics
 * @route   GET /api/players/stats
 * @access  Private/Admin
 */
exports.getPlayerStats = asyncHandler(async (req, res) => {
  const { branch_id } = req.query;
  const where = {};

  if (branch_id) where.branch_id = branch_id;
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    where.branch_id = req.user.branch_id;
  }

  const [total, active, inactive, byGender, bySkillLevel] = await Promise.all([
    Player.count({ where }),
    Player.count({ where: { ...where, status: PLAYER_STATUS.ACTIVE } }),
    Player.count({ where: { ...where, status: PLAYER_STATUS.INACTIVE } }),
    Player.findAll({
      where,
      attributes: ['gender', [require('sequelize').fn('COUNT', 'id'), 'count']],
      group: ['gender']
    }),
    Player.findAll({
      where,
      attributes: ['skill_level', [require('sequelize').fn('COUNT', 'id'), 'count']],
      group: ['skill_level']
    })
  ]);

  res.json({
    success: true,
    data: {
      total,
      active,
      inactive,
      byGender: byGender.reduce((acc, item) => {
        acc[item.gender] = parseInt(item.get('count'));
        return acc;
      }, {}),
      bySkillLevel: bySkillLevel.reduce((acc, item) => {
        acc[item.skill_level] = parseInt(item.get('count'));
        return acc;
      }, {})
    }
  });
});

/**
 * @desc    Link a player to parent by registration code
 * @route   POST /api/players/link
 * @access  Private (parent)
 */
exports.linkPlayer = asyncHandler(async (req, res) => {
  const { registration_code } = req.body;

  if (!registration_code) {
    throw new AppError('Registration code is required', 400);
  }

  // Find player by registration number
  const player = await Player.findOne({
    where: { registration_number: registration_code },
    include: [
      { model: User, as: 'parent', attributes: ['id', 'first_name', 'last_name'] },
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'name_ar'] }
    ]
  });

  if (!player) {
    throw new AppError(
      'Player not found with this registration code',
      404
    );
  }

  // Check if player is a self-registered player
  if (!player.self_user_id) {
    throw new AppError(
      'This player is not a self-registered player. They are already managed by a parent.',
      400
    );
  }

  // Check if already linked to this parent
  if (player.parent_id === req.user.id) {
    throw new AppError('This player is already linked to your account', 400);
  }

  // Update the player's parent_id to the requesting parent
  await player.update({ parent_id: req.user.id });

  console.log(`🔗 Player ${player.id} manually linked to parent ${req.user.id}`);

  res.json({
    success: true,
    message: 'Player linked to your account successfully',
    data: {
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      registration_number: player.registration_number
    }
  });
});

