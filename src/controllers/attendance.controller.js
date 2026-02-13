const { Attendance, Player, Program, User, CoachAttendance, Branch } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES, ATTENDANCE_STATUS } = require('../config/constants');
const { emitAttendanceUpdate } = require('../socket');
const { logAuditEvent, getLatestAuditMap } = require('../utils/auditLogger');

/**
 * @desc    Get all attendance records
 * @route   GET /api/attendance
 * @access  Private/Admin/Coach
 */
exports.getAllAttendance = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, program_id, player_id, status, start_date, end_date } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (program_id) where.program_id = program_id;
  if (player_id) where.player_id = player_id;
  if (status) where.status = status;

  if (start_date && end_date) {
    where.session_date = {
      [Op.between]: [start_date, end_date]
    };
  }

  // Role-based filtering
  if (req.user.role === ROLES.COACH) {
    const programs = await Program.findAll({
      where: { coach_id: req.user.id },
      attributes: ['id']
    });
    where.program_id = { [Op.in]: programs.map(p => p.id) };
  }

  const attendance = await Attendance.findAndCountAll({
    where,
    include: [
      { association: 'player', attributes: ['id', 'first_name', 'last_name', 'registration_number'] },
      { association: 'program', attributes: ['id', 'name'] },
      { association: 'recorder', attributes: ['id', 'first_name', 'last_name'] }
    ],
    offset,
    limit: limitNum,
    order: [['session_date', 'DESC'], ['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(attendance, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get attendance by ID
 * @route   GET /api/attendance/:id
 * @access  Private
 */
exports.getAttendanceById = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findByPk(req.params.id, {
    include: [
      { association: 'player' },
      { association: 'program' },
      { association: 'recorder' }
    ]
  });

  if (!attendance) {
    throw new AppError('Attendance record not found', 404);
  }

  res.json({
    success: true,
    data: attendance
  });
});

/**
 * @desc    Record single attendance
 * @route   POST /api/attendance
 * @access  Private/Admin/Coach
 */
exports.recordAttendance = asyncHandler(async (req, res) => {
  const {
    player_id, program_id, session_date, session_time,
    status, check_in_time, check_out_time, notes,
    excuse_reason, performance_rating, performance_notes
  } = req.body;

  // Validate player and program
  const player = await Player.findByPk(player_id);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  const program = await Program.findByPk(program_id);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  // Check if attendance already exists for this date
  const existing = await Attendance.findOne({
    where: { player_id, program_id, session_date }
  });

  if (existing) {
    throw new AppError('Attendance already recorded for this date', 400);
  }

  const attendance = await Attendance.create({
    player_id,
    program_id,
    session_date,
    session_time,
    status,
    check_in_time,
    check_out_time,
    recorded_by: req.user.id,
    notes,
    excuse_reason,
    performance_rating,
    performance_notes
  });

  res.status(201).json({
    success: true,
    message: 'Attendance recorded successfully',
    data: attendance
  });
});

/**
 * @desc    Bulk record attendance
 * @route   POST /api/attendance/bulk
 * @access  Private/Admin/Coach
 */
exports.bulkRecordAttendance = asyncHandler(async (req, res) => {
  const { program_id, session_date, session_time, attendance } = req.body;

  // Validate program
  const program = await Program.findByPk(program_id);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  const results = {
    created: 0,
    updated: 0,
    errors: []
  };

  for (const record of attendance) {
    try {
      const [att, created] = await Attendance.upsert({
        player_id: record.player_id,
        program_id,
        session_date,
        session_time,
        status: record.status,
        check_in_time: record.check_in_time,
        notes: record.notes,
        excuse_reason: record.excuse_reason,
        recorded_by: req.user.id
      });

      if (created) {
        results.created++;
      } else {
        results.updated++;
      }
    } catch (error) {
      results.errors.push({
        player_id: record.player_id,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    message: `Attendance recorded: ${results.created} created, ${results.updated} updated`,
    data: results
  });
});

/**
 * @desc    Update attendance
 * @route   PUT /api/attendance/:id
 * @access  Private/Admin/Coach
 */
exports.updateAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findByPk(req.params.id);

  if (!attendance) {
    throw new AppError('Attendance record not found', 404);
  }

  await attendance.update({
    ...req.body,
    recorded_by: req.user.id
  });

  res.json({
    success: true,
    message: 'Attendance updated successfully',
    data: attendance
  });
});

/**
 * @desc    Delete attendance record
 * @route   DELETE /api/attendance/:id
 * @access  Private/Admin
 */
exports.deleteAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findByPk(req.params.id);

  if (!attendance) {
    throw new AppError('Attendance record not found', 404);
  }

  await attendance.destroy();

  res.json({
    success: true,
    message: 'Attendance record deleted successfully'
  });
});

/**
 * @desc    Get attendance by player
 * @route   GET /api/attendance/player/:playerId
 * @access  Private
 */
exports.getAttendanceByPlayer = asyncHandler(async (req, res) => {
  const { playerId } = req.params;
  const { start_date, end_date, program_id } = req.query;

  const player = await Player.findByPk(playerId);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access for parents
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized to view this player\'s attendance', 403);
  }

  const where = { player_id: playerId };
  if (program_id) where.program_id = program_id;
  if (start_date && end_date) {
    where.session_date = { [Op.between]: [start_date, end_date] };
  }

  const attendance = await Attendance.findAll({
    where,
    include: [
      { association: 'program', attributes: ['id', 'name'] }
    ],
    order: [['session_date', 'DESC']]
  });

  res.json({
    success: true,
    data: attendance
  });
});

/**
 * @desc    Get attendance by program
 * @route   GET /api/attendance/program/:programId
 * @access  Private/Admin/Coach
 */
exports.getAttendanceByProgram = asyncHandler(async (req, res) => {
  const { programId } = req.params;
  const { session_date } = req.query;

  const where = { program_id: programId };
  if (session_date) where.session_date = session_date;

  const attendance = await Attendance.findAll({
    where,
    include: [
      { association: 'player', attributes: ['id', 'first_name', 'last_name', 'avatar'] }
    ],
    order: [['session_date', 'DESC'], ['player_id', 'ASC']]
  });

  res.json({
    success: true,
    data: attendance
  });
});

/**
 * @desc    Get attendance by date
 * @route   GET /api/attendance/date/:date
 * @access  Private/Admin/Coach
 */
exports.getAttendanceByDate = asyncHandler(async (req, res) => {
  const { date } = req.params;
  const { program_id } = req.query;

  const where = { session_date: date };
  if (program_id) where.program_id = program_id;

  // Role-based filtering
  if (req.user.role === ROLES.COACH) {
    const programs = await Program.findAll({
      where: { coach_id: req.user.id },
      attributes: ['id']
    });
    where.program_id = { [Op.in]: programs.map(p => p.id) };
  }

  const attendance = await Attendance.findAll({
    where,
    include: [
      { association: 'player', attributes: ['id', 'first_name', 'last_name', 'avatar'] },
      { association: 'program', attributes: ['id', 'name'] }
    ],
    order: [['program_id', 'ASC'], ['player_id', 'ASC']]
  });

  res.json({
    success: true,
    data: attendance
  });
});

/**
 * @desc    Get player attendance summary
 * @route   GET /api/attendance/player/:playerId/summary
 * @access  Private
 */
exports.getPlayerAttendanceSummary = asyncHandler(async (req, res) => {
  const { playerId } = req.params;
  const { start_date, end_date } = req.query;

  const player = await Player.findByPk(playerId);
  if (!player) {
    throw new AppError('Player not found', 404);
  }

  // Check access for parents
  if (req.user.role === ROLES.PARENT && player.parent_id !== req.user.id && player.self_user_id !== req.user.id) {
    throw new AppError('Not authorized', 403);
  }

  const where = { player_id: playerId };
  if (start_date && end_date) {
    where.session_date = { [Op.between]: [start_date, end_date] };
  }

  const [total, present, absent, late, excused] = await Promise.all([
    Attendance.count({ where }),
    Attendance.count({ where: { ...where, status: ATTENDANCE_STATUS.PRESENT } }),
    Attendance.count({ where: { ...where, status: ATTENDANCE_STATUS.ABSENT } }),
    Attendance.count({ where: { ...where, status: ATTENDANCE_STATUS.LATE } }),
    Attendance.count({ where: { ...where, status: ATTENDANCE_STATUS.LEAVE } })
  ]);

  const attendanceRate = total > 0 ? ((present + late) / total * 100).toFixed(1) : 0;

  res.json({
    success: true,
    data: {
      player_id: playerId,
      total_sessions: total,
      present,
      absent,
      late,
      excused,
      attendance_rate: parseFloat(attendanceRate)
    }
  });
});

/**
 * @desc    Get attendance report
 * @route   GET /api/attendance/report/:programId
 * @access  Private/Admin/Coach
 */
exports.getAttendanceReport = asyncHandler(async (req, res) => {
  const { programId } = req.params;
  const { start_date, end_date } = req.query;

  const program = await Program.findByPk(programId);
  if (!program) {
    throw new AppError('Program not found', 404);
  }

  const where = { program_id: programId };
  if (start_date && end_date) {
    where.session_date = { [Op.between]: [start_date, end_date] };
  }

  // Get all players in program
  const players = await Player.findAll({
    where: { program_id: programId, status: 'active' },
    attributes: ['id', 'first_name', 'last_name']
  });

  // Get attendance stats for each player
  const report = await Promise.all(
    players.map(async (player) => {
      const playerWhere = { ...where, player_id: player.id };
      const [total, present, absent, late] = await Promise.all([
        Attendance.count({ where: playerWhere }),
        Attendance.count({ where: { ...playerWhere, status: ATTENDANCE_STATUS.PRESENT } }),
        Attendance.count({ where: { ...playerWhere, status: ATTENDANCE_STATUS.ABSENT } }),
        Attendance.count({ where: { ...playerWhere, status: ATTENDANCE_STATUS.LATE } })
      ]);

      return {
        player_id: player.id,
        player_name: `${player.first_name} ${player.last_name}`,
        total_sessions: total,
        present,
        absent,
        late,
        attendance_rate: total > 0 ? ((present + late) / total * 100).toFixed(1) : 0
      };
    })
  );

  res.json({
    success: true,
    data: {
      program: {
        id: program.id,
        name: program.name
      },
      date_range: { start_date, end_date },
      report
    }
  });
});

/**
 * @desc    Get attendance statistics
 * @route   GET /api/attendance/stats
 * @access  Private/Admin/Coach
 */
exports.getAttendanceStats = asyncHandler(async (req, res) => {
  const { program_id, branch_id, start_date, end_date } = req.query;

  let programIds = [];

  if (program_id) {
    programIds = [program_id];
  } else if (branch_id) {
    const programs = await Program.findAll({
      where: { branch_id, is_active: true },
      attributes: ['id']
    });
    programIds = programs.map(p => p.id);
  } else if (req.user.role === ROLES.COACH) {
    const programs = await Program.findAll({
      where: { coach_id: req.user.id },
      attributes: ['id']
    });
    programIds = programs.map(p => p.id);
  }

  const where = {};
  if (programIds.length > 0) {
    where.program_id = { [Op.in]: programIds };
  }
  if (start_date && end_date) {
    where.session_date = { [Op.between]: [start_date, end_date] };
  }

  const [total, byStatus] = await Promise.all([
    Attendance.count({ where }),
    Attendance.findAll({
      where,
      attributes: ['status', [require('sequelize').fn('COUNT', 'id'), 'count']],
      group: ['status']
    })
  ]);

  const stats = byStatus.reduce((acc, item) => {
    acc[item.status] = parseInt(item.get('count'));
    return acc;
  }, {});

  const present = stats.present || 0;
  const late = stats.late || 0;
  const overallRate = total > 0 ? ((present + late) / total * 100).toFixed(1) : 0;

  res.json({
    success: true,
    data: {
      total_records: total,
      ...stats,
      overall_attendance_rate: parseFloat(overallRate)
    }
  });
});

// ===== COACH ATTENDANCE METHODS =====

/**
 * @desc    Get coach attendance by date
 * @route   GET /api/attendance/coach
 * @access  Private/Admin
 */
exports.getCoachAttendance = asyncHandler(async (req, res) => {
  const { date, branch_id, page = 1, limit = 50 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};
  if (date) where.date = date;
  if (branch_id) where.branch_id = branch_id;

  const attendance = await CoachAttendance.findAndCountAll({
    where,
    include: [
      { 
        model: User, 
        as: 'coach', 
        attributes: ['id', 'first_name', 'last_name', 'phone', 'avatar'] 
      },
      { 
        model: Branch, 
        as: 'branch', 
        attributes: ['id', 'name', 'name_ar'] 
      },
      { 
        model: User, 
        as: 'recorder', 
        attributes: ['id', 'first_name', 'last_name'] 
      }
    ],
    offset,
    limit: limitNum,
    order: [['date', 'DESC'], ['created_at', 'DESC']]
  });

  const latestAuditMap = await getLatestAuditMap('coach_attendance', attendance.rows.map((item) => item.id));
  const enrichedRows = attendance.rows.map((row) => {
    const item = row.toJSON();
    const latestAudit = latestAuditMap[item.id];
    const actor = latestAudit?.actor || item.recorder;
    item.last_updated_by = actor
      ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
      : null;
    item.last_updated_at = latestAudit?.created_at || item.updated_at || item.created_at;
    return item;
  });
  attendance.rows = enrichedRows;

  const response = formatPaginationResponse(attendance, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get coach attendance stats
 * @route   GET /api/attendance/coach/stats
 * @access  Private/Admin
 */
exports.getCoachAttendanceStats = asyncHandler(async (req, res) => {
  const { date, branch_id, start_date, end_date } = req.query;

  const where = {};
  if (date) where.date = date;
  if (branch_id) where.branch_id = branch_id;
  if (start_date && end_date) {
    where.date = { [Op.between]: [start_date, end_date] };
  }

  const [total, byStatus] = await Promise.all([
    CoachAttendance.count({ where }),
    CoachAttendance.findAll({
      where,
      attributes: ['status', [require('sequelize').fn('COUNT', 'id'), 'count']],
      group: ['status']
    })
  ]);

  const stats = byStatus.reduce((acc, item) => {
    acc[item.status] = parseInt(item.get('count'));
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      total: total,
      present: stats.present || 0,
      absent: stats.absent || 0,
      late: stats.late || 0,
      leave: stats.leave || 0
    }
  });
});

/**
 * @desc    Record/Update coach attendance
 * @route   POST /api/attendance/coach
 * @access  Private/Admin
 */
exports.recordCoachAttendance = asyncHandler(async (req, res) => {
  const { coach_id, branch_id, date, status, notes } = req.body;

  // Validate coach exists and is a coach
  const coach = await User.findOne({
    where: { id: coach_id, role: ROLES.COACH }
  });
  if (!coach) {
    throw new AppError('Coach not found', 404);
  }

  // Upsert - update if exists, create if not
  const [attendance, created] = await CoachAttendance.upsert({
    coach_id,
    branch_id: branch_id || coach.branch_id,
    date,
    status: status || 'present',
    notes,
    recorded_by: req.user.id
  }, {
    returning: true
  });

  res.status(created ? 201 : 200).json({
    success: true,
    message: created ? 'Attendance recorded' : 'Attendance updated',
    data: attendance
  });
});

/**
 * @desc    Bulk record coach attendance
 * @route   POST /api/attendance/coach/bulk
 * @access  Private/Admin
 */
exports.bulkRecordCoachAttendance = asyncHandler(async (req, res) => {
  const { date, attendances } = req.body;

  if (!date || !attendances || !Array.isArray(attendances)) {
    throw new AppError('Date and attendances array required', 400);
  }

  const results = await Promise.all(
    attendances.map(async (att) => {
      const [record, created] = await CoachAttendance.upsert({
        coach_id: att.coach_id,
        branch_id: att.branch_id,
        date,
        status: att.status || 'absent',
        notes: att.notes,
        recorded_by: req.user.id
      }, {
        returning: true
      });
      return record;
    })
  );

  await logAuditEvent({
    module: 'attendance',
    entityType: 'coach_attendance',
    entityId: date,
    action: 'bulk_update',
    actor: req.user,
    metadata: {
      date,
      count: results.length,
      coach_ids: attendances.map((a) => a.coach_id)
    }
  });

  // Emit socket event for real-time updates
  emitAttendanceUpdate('coach', {
    date,
    updated_by: req.user.id,
    updated_by_role: req.user.role,
    count: results.length
  });

  res.json({
    success: true,
    message: `${results.length} attendance records saved`,
    data: results
  });
});

/**
 * @desc    Get coach attendance summary (for reports)
 * @route   GET /api/attendance/coach/summary
 * @access  Private/Admin
 */
exports.getCoachAttendanceSummary = asyncHandler(async (req, res) => {
  const { start_date, end_date, branch_id } = req.query;

  if (!start_date || !end_date) {
    throw new AppError('Start date and end date are required', 400);
  }

  const where = {
    date: { [Op.between]: [start_date, end_date] }
  };
  if (branch_id) where.branch_id = branch_id;

  // Get all coaches
  const coachWhere = { role: ROLES.COACH, is_active: true };
  if (branch_id) coachWhere.branch_id = branch_id;

  const coaches = await User.findAll({
    where: coachWhere,
    attributes: ['id', 'first_name', 'last_name', 'phone'],
    include: [{ model: Branch, as: 'branch', attributes: ['id', 'name', 'name_ar'] }]
  });

  // Get attendance summary for each coach
  const summary = await Promise.all(
    coaches.map(async (coach) => {
      const coachWhere = { ...where, coach_id: coach.id };
      
      const [present, absent, late, leave] = await Promise.all([
        CoachAttendance.count({ where: { ...coachWhere, status: 'present' } }),
        CoachAttendance.count({ where: { ...coachWhere, status: 'absent' } }),
        CoachAttendance.count({ where: { ...coachWhere, status: 'late' } }),
        CoachAttendance.count({ where: { ...coachWhere, status: 'leave' } })
      ]);

      return {
        coach_id: coach.id,
        coach_name: `${coach.first_name} ${coach.last_name}`,
        phone: coach.phone,
        branch: coach.branch?.name || '',
        branch_ar: coach.branch?.name_ar || '',
        present,
        absent,
        late,
        leave
      };
    })
  );

  res.json({
    success: true,
    data: {
      date_range: { start_date, end_date },
      summary
    }
  });
});

/**
 * @desc    Initialize coach attendance for a date (create records for all coaches)
 * @route   POST /api/attendance/coach/init
 * @access  Private/Admin
 */
exports.initCoachAttendance = asyncHandler(async (req, res) => {
  const { date, branch_id } = req.body;

  if (!date) {
    throw new AppError('Date is required', 400);
  }

  // Get all active coaches
  const coachWhere = { role: ROLES.COACH, is_active: true };
  if (branch_id) coachWhere.branch_id = branch_id;

  const coaches = await User.findAll({
    where: coachWhere,
    attributes: ['id', 'branch_id']
  });

  // Create attendance records for coaches who don't have one for this date
  const created = [];
  for (const coach of coaches) {
    const existing = await CoachAttendance.findOne({
      where: { coach_id: coach.id, date }
    });

    if (!existing) {
      const record = await CoachAttendance.create({
        coach_id: coach.id,
        branch_id: coach.branch_id,
        date,
        status: 'absent',
        recorded_by: req.user.id
      });
      created.push(record);
    }
  }

  res.json({
    success: true,
    message: `${created.length} attendance records initialized`,
    data: { created_count: created.length, total_coaches: coaches.length }
  });
});

// ===== PLAYER ATTENDANCE (Super Admin) =====

/**
 * @desc    Get players list for attendance with their status
 * @route   GET /api/attendance/players/list
 * @access  Private/Admin
 */
exports.getPlayersForAttendance = asyncHandler(async (req, res) => {
  const { date, program_id, branch_id, coach_id } = req.query;

  const playerWhere = { status: 'active' };
  if (branch_id) playerWhere.branch_id = branch_id;
  if (program_id) playerWhere.program_id = program_id;
  if (coach_id) playerWhere.coach_id = coach_id;

  // Role-based filtering - Coaches can only see their own players
  if (req.user.role === ROLES.COACH) {
    playerWhere.coach_id = req.user.id;
  }

  const include = [
    {
      model: Program,
      as: 'program',
      attributes: ['id', 'name', 'name_ar', 'branch_id'],
      required: false
    }
  ];

  const players = await Player.findAll({
    where: playerWhere,
    include,
    attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'program_id', 'branch_id'],
    order: [['first_name', 'ASC']]
  });

  // Get existing attendance for this date
  const existingAttendance = date ? await Attendance.findAll({
    where: { session_date: date },
    attributes: ['player_id', 'status', 'id', 'updated_at', 'created_at'],
    include: [{ association: 'recorder', attributes: ['id', 'first_name', 'last_name', 'role'] }]
  }) : [];

  const attendanceMap = {};
  existingAttendance.forEach(a => {
    attendanceMap[a.player_id] = {
      status: a.status,
      id: a.id,
      recorder: a.recorder || null,
      updated_at: a.updated_at || a.created_at
    };
  });

  // Combine players with their attendance status
  const result = players.map(player => ({
    id: player.id,
    player_id: player.id,
    first_name: player.first_name,
    last_name: player.last_name,
    first_name_ar: player.first_name_ar,
    last_name_ar: player.last_name_ar,
    program: player.program,
    program_id: player.program_id,
    branch_id: player.branch_id,
    status: attendanceMap[player.id]?.status || 'absent',
    attendance_id: attendanceMap[player.id]?.id || null,
    last_updated_by: attendanceMap[player.id]?.recorder || null,
    last_updated_at: attendanceMap[player.id]?.updated_at || null
  }));

  res.json({
    success: true,
    data: result
  });
});

/**
 * @desc    Initialize player attendance for a date
 * @route   POST /api/attendance/players/init
 * @access  Private/Admin
 */
exports.initPlayerAttendance = asyncHandler(async (req, res) => {
  const { date, program_id } = req.body;

  if (!date) {
    throw new AppError('Date is required', 400);
  }

  const playerWhere = { status: 'active' };
  if (program_id) playerWhere.program_id = program_id;

  // Role-based filtering - Coaches can only initialize attendance for their own players
  if (req.user.role === ROLES.COACH) {
    playerWhere.coach_id = req.user.id;
  }

  const players = await Player.findAll({
    where: playerWhere,
    attributes: ['id', 'program_id']
  });

  // Create attendance records for players who don't have one for this date
  const created = [];
  for (const player of players) {
    if (!player.program_id) continue;
    
    const existing = await Attendance.findOne({
      where: { player_id: player.id, session_date: date }
    });

    if (!existing) {
      const record = await Attendance.create({
        player_id: player.id,
        program_id: player.program_id,
        session_date: date,
        status: 'absent',
        recorded_by: req.user.id
      });
      created.push(record);
    }
  }

  res.json({
    success: true,
    message: `${created.length} attendance records initialized`,
    data: { created_count: created.length, total_players: players.length }
  });

  if (created.length > 0) {
    await logAuditEvent({
      module: 'attendance',
      entityType: 'player_attendance',
      entityId: date,
      action: 'bulk_update',
      actor: req.user,
      metadata: {
        date,
        created_count: created.length,
        player_ids: created.map((item) => item.player_id)
      }
    });
  }
});

/**
 * @desc    Bulk record player attendance
 * @route   POST /api/attendance/players/bulk
 * @access  Private/Admin
 */
exports.bulkRecordPlayerAttendance = asyncHandler(async (req, res) => {
  const { date, attendances } = req.body;

  if (!date || !attendances || !Array.isArray(attendances)) {
    throw new AppError('Date and attendances array required', 400);
  }

  const results = await Promise.all(
    attendances.map(async (att) => {
      // Get player's program_id and coach_id
      const player = await Player.findByPk(att.player_id, { attributes: ['id', 'program_id', 'coach_id'] });
      if (!player || !player.program_id) return null;

      // Role-based validation - Coaches can only record attendance for their own players
      if (req.user.role === ROLES.COACH && player.coach_id !== req.user.id) {
        return null; // Skip players that don't belong to this coach
      }

      const [record, created] = await Attendance.upsert({
        player_id: att.player_id,
        program_id: player.program_id,
        session_date: date,
        status: att.status || 'absent',
        recorded_by: req.user.id
      }, {
        returning: true
      });
      return record;
    })
  );

  await logAuditEvent({
    module: 'attendance',
    entityType: 'player_attendance',
    entityId: date,
    action: 'bulk_update',
    actor: req.user,
    metadata: {
      date,
      count: results.filter(r => r).length,
      player_ids: attendances.map((a) => a.player_id)
    }
  });

  // Emit socket event for real-time updates
  emitAttendanceUpdate('player', {
    date,
    updated_by: req.user.id,
    updated_by_role: req.user.role,
    count: results.filter(r => r).length
  });

  res.json({
    success: true,
    message: `${results.filter(r => r).length} attendance records saved`,
    data: results.filter(r => r)
  });
});
