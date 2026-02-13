const { TrainingSession, Program, Branch, User, Player, Waitlist } = require('../models');
const scheduleService = require('../services/schedule.service');
const { emitScheduleUpdate, emitWaitlistUpdate } = require('../socket');
const { Op } = require('sequelize');
const ical = require('ical-generator').default;
const PDFDocument = require('pdfkit');
const { ROLES } = require('../config/constants');

const getParentScope = async (userId) => {
  const players = await Player.findAll({
    where: {
      [Op.or]: [
        { parent_id: userId },
        { self_user_id: userId }
      ]
    },
    attributes: ['id', 'program_id', 'branch_id']
  });
  const programIds = players.map((p) => p.program_id).filter(Boolean);
  const branchIds = players.map((p) => p.branch_id).filter(Boolean);
  return { programIds, branchIds, playerIds: players.map(p => p.id) };
};

/**
 * Get all sessions for a branch
 * @route GET /api/schedule/branch/:branchId
 */
exports.getBranchSchedule = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { startDate, endDate, programId, coachId, isCancelled } = req.query;

    const whereClause = { branch_id: branchId };

    if (req.user?.role === ROLES.PARENT) {
      const { programIds, branchIds } = await getParentScope(req.user.id);
      if (!branchIds.includes(branchId)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action.'
        });
      }
      if (programIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      whereClause.program_id = { [Op.in]: programIds };
    }

    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    }

    if (programId) {
      whereClause.program_id = programId;
    }

    if (coachId) {
      whereClause.coach_id = coachId;
    }

    if (isCancelled !== undefined) {
      whereClause.is_cancelled = isCancelled === 'true';
    }

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type', 'capacity']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'avatar']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get week schedule for a branch
 * @route GET /api/schedule/branch/:branchId/week
 */
exports.getWeekSchedule = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { startDate } = req.query;

    // Calculate week start (Sunday) and end (Saturday)
    const weekStart = new Date(startDate || new Date());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const whereClause = {
      branch_id: branchId,
      date: {
        [Op.between]: [
          weekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0]
        ]
      }
    };

    if (req.user?.role === ROLES.PARENT) {
      const { programIds, branchIds } = await getParentScope(req.user.id);
      if (!branchIds.includes(branchId)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action.'
        });
      }
      if (programIds.length === 0) {
        return res.json({ success: true, data: { sessions: [], stats: { total_sessions: 0, total_players: 0, cancelled_sessions: 0, capacity_utilization: 0 }, week_start: weekStart.toISOString().split('T')[0], week_end: weekEnd.toISOString().split('T')[0] } });
      }
      whereClause.program_id = { [Op.in]: programIds };
    }

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type', 'capacity']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'avatar']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    // Calculate stats
    const stats = {
      total_sessions: sessions.length,
      total_players: sessions.reduce((sum, s) => sum + s.current_enrollment, 0),
      cancelled_sessions: sessions.filter(s => s.is_cancelled).length,
      capacity_utilization: sessions.length > 0
        ? Math.round((sessions.reduce((sum, s) => sum + (s.current_enrollment / s.max_capacity), 0) / sessions.length) * 100)
        : 0
    };

    res.json({
      success: true,
      data: {
        sessions,
        stats,
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get day schedule for a branch
 * @route GET /api/schedule/branch/:branchId/day
 */
exports.getDaySchedule = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { date } = req.query;

    const targetDate = date || new Date().toISOString().split('T')[0];

    const whereClause = {
      branch_id: branchId,
      date: targetDate
    };

    if (req.user?.role === ROLES.PARENT) {
      const { programIds, branchIds } = await getParentScope(req.user.id);
      if (!branchIds.includes(branchId)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action.'
        });
      }
      if (programIds.length === 0) {
        return res.json({ success: true, data: { date: targetDate, sessions: [] } });
      }
      whereClause.program_id = { [Op.in]: programIds };
    }

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type', 'capacity'],
          include: [
            {
              model: Player,
              as: 'players',
              attributes: ['id', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar', 'avatar']
            }
          ]
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'avatar']
        }
      ],
      order: [['start_time', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        date: targetDate,
        sessions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get program schedule
 * @route GET /api/schedule/program/:programId
 */
exports.getProgramSchedule = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { startDate, endDate } = req.query;

    const whereClause = { program_id: programId };

    if (req.user?.role === ROLES.PARENT) {
      const { programIds } = await getParentScope(req.user.id);
      if (!programIds.includes(programId)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action.'
        });
      }
    }

    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    }

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'avatar']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a single training session
 * @route POST /api/schedule/session
 */
exports.createSession = async (req, res, next) => {
  try {
    const {
      program_id,
      coach_id,
      date,
      start_time,
      end_time,
      facility,
      max_capacity,
      is_recurring,
      notes
    } = req.body;

    // Get program to get branch_id
    const program = await Program.findByPk(program_id);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Program not found'
      });
    }

    const day_of_week = scheduleService.getDayOfWeek(date);

    // Validate scheduling (check conflicts)
    const validation = await scheduleService.validateSession({
      coach_id,
      branch_id: program.branch_id,
      facility,
      date,
      start_time,
      end_time
    });

    if (!validation.isValid) {
      return res.status(409).json({
        success: false,
        message: 'Scheduling conflict detected',
        conflicts: {
          coach: validation.coachConflicts,
          facility: validation.facilityConflicts
        }
      });
    }

    // Create session
    const session = await TrainingSession.create({
      program_id,
      branch_id: program.branch_id,
      coach_id,
      date,
      day_of_week,
      start_time,
      end_time,
      facility,
      max_capacity: max_capacity || program.capacity,
      current_enrollment: program.current_enrollment,
      is_recurring: is_recurring !== undefined ? is_recurring : true,
      notes
    });

    // If recurring, create weekly sessions ahead
    let recurringCreated = 0;
    if (is_recurring === true) {
      const startDate = new Date(date);
      const programEndDate = program.end_date ? new Date(program.end_date) : null;
      const defaultEnd = new Date(startDate);
      defaultEnd.setDate(defaultEnd.getDate() + (52 * 7));
      const endDate = programEndDate && programEndDate > startDate ? programEndDate : defaultEnd;

      const nextDate = new Date(startDate);
      nextDate.setDate(nextDate.getDate() + 7);

      while (nextDate <= endDate) {
        const nextDateString = nextDate.toISOString().split('T')[0];
        const nextDayOfWeek = scheduleService.getDayOfWeek(nextDateString);

        const recurringValidation = await scheduleService.validateSession({
          coach_id,
          branch_id: program.branch_id,
          facility,
          date: nextDateString,
          start_time,
          end_time
        });

        if (recurringValidation.isValid) {
          await TrainingSession.create({
            program_id,
            branch_id: program.branch_id,
            coach_id,
            date: nextDateString,
            day_of_week: nextDayOfWeek,
            start_time,
            end_time,
            facility,
            max_capacity: max_capacity || program.capacity,
            current_enrollment: program.current_enrollment,
            is_recurring: true,
            notes
          });
          recurringCreated += 1;
        }

        nextDate.setDate(nextDate.getDate() + 7);
      }
    }

    // Load full session data
    const fullSession = await TrainingSession.findByPk(session.id, {
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'avatar']
        }
      ]
    });

    // Notify enrolled players
    await scheduleService.notifyEnrolledPlayers(session.id, 'created');

    // Emit real-time update
    emitScheduleUpdate('created', {
      ...fullSession.toJSON(),
      branch_id: fullSession.branch_id
    });

    res.status(201).json({
      success: true,
      message: 'Training session created successfully',
      data: fullSession,
      recurring_created: recurringCreated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a training session
 * @route PUT /api/schedule/session/:sessionId
 */
exports.updateSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const {
      coach_id,
      date,
      start_time,
      end_time,
      facility,
      max_capacity,
      notes
    } = req.body;

    const session = await TrainingSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    const oldDate = session.date;
    const oldTime = session.start_time;

    // If date or time changed, validate
    if (date || start_time || end_time || coach_id || facility) {
      const validation = await scheduleService.validateSession({
        coach_id: coach_id || session.coach_id,
        branch_id: session.branch_id,
        facility: facility !== undefined ? facility : session.facility,
        date: date || session.date,
        start_time: start_time || session.start_time,
        end_time: end_time || session.end_time,
        session_id: sessionId
      });

      if (!validation.isValid) {
        return res.status(409).json({
          success: false,
          message: 'Scheduling conflict detected',
          conflicts: {
            coach: validation.coachConflicts,
            facility: validation.facilityConflicts
          }
        });
      }
    }

    // Update session
    const updateData = {};
    if (coach_id) updateData.coach_id = coach_id;
    if (date) {
      updateData.date = date;
      updateData.day_of_week = scheduleService.getDayOfWeek(date);
    }
    if (start_time) updateData.start_time = start_time;
    if (end_time) updateData.end_time = end_time;
    if (facility !== undefined) updateData.facility = facility;
    if (max_capacity) updateData.max_capacity = max_capacity;
    if (notes !== undefined) updateData.notes = notes;

    await session.update(updateData);

    // Load full session data
    const fullSession = await TrainingSession.findByPk(sessionId, {
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'avatar']
        }
      ]
    });

    // If date or time changed, notify players
    if (date || start_time) {
      await scheduleService.notifyEnrolledPlayers(sessionId, 'rescheduled', {
        oldDate,
        oldTime,
        newDate: session.date,
        newTime: session.start_time
      });
    }

    // Emit real-time update
    emitScheduleUpdate('updated', {
      ...fullSession.toJSON(),
      branch_id: fullSession.branch_id
    });

    res.json({
      success: true,
      message: 'Training session updated successfully',
      data: fullSession
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel a training session
 * @route DELETE /api/schedule/session/:sessionId
 */
exports.cancelSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { reason, permanent } = req.body;

    const session = await TrainingSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    const branchId = session.branch_id;

    if (permanent) {
      // Permanent deletion
      await session.destroy();
    } else {
      // Soft cancellation
      await session.update({
        is_cancelled: true,
        cancellation_reason: reason,
        cancelled_by: req.user.id,
        cancelled_at: new Date()
      });
    }

    // Notify enrolled players
    await scheduleService.notifyEnrolledPlayers(sessionId, 'cancelled', { reason });

    // Emit real-time update
    emitScheduleUpdate(permanent ? 'deleted' : 'cancelled', {
      id: sessionId,
      branch_id: branchId,
      is_cancelled: !permanent ? true : undefined,
      cancellation_reason: reason
    });

    res.json({
      success: true,
      message: permanent ? 'Training session deleted permanently' : 'Training session cancelled',
      data: { id: sessionId }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate session scheduling
 * @route POST /api/schedule/validate
 */
exports.validateSchedule = async (req, res, next) => {
  try {
    const { coach_id, branch_id, facility, date, start_time, end_time, session_id } = req.body;

    const validation = await scheduleService.validateSession({
      coach_id,
      branch_id,
      facility,
      date,
      start_time,
      end_time,
      session_id
    });

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get coach weekly schedule
 * @route GET /api/schedule/coach/:coachId/week
 */
exports.getCoachSchedule = async (req, res, next) => {
  try {
    const { coachId } = req.params;
    const { startDate } = req.query;

    const weekStart = new Date(startDate || new Date());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const sessions = await TrainingSession.findAll({
      where: {
        coach_id: coachId,
        date: {
          [Op.between]: [
            weekStart.toISOString().split('T')[0],
            weekEnd.toISOString().split('T')[0]
          ]
        }
      },
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        sessions,
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate recurring sessions for a program
 * @route POST /api/schedule/program/:programId/generate
 */
exports.generateRecurringSessions = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { startDate, endDate, weeksAhead } = req.body;

    const sessions = await scheduleService.generateRecurringSessions(programId, {
      startDate,
      endDate,
      weeksAhead
    });

    res.status(201).json({
      success: true,
      message: `Generated ${sessions.length} recurring sessions`,
      data: {
        count: sessions.length,
        sessions: sessions.slice(0, 10) // Return first 10 as sample
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get schedule statistics
 * @route GET /api/schedule/stats
 */
exports.getScheduleStats = async (req, res, next) => {
  try {
    const { branchId, startDate, endDate } = req.query;

    const whereClause = {};
    if (branchId) whereClause.branch_id = branchId;
    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    }

    const allSessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar']
        }
      ]
    });

    const stats = {
      total_sessions: allSessions.length,
      cancelled_sessions: allSessions.filter(s => s.is_cancelled).length,
      active_sessions: allSessions.filter(s => !s.is_cancelled).length,
      total_capacity: allSessions.reduce((sum, s) => sum + (s.max_capacity || 0), 0),
      total_enrollment: allSessions.reduce((sum, s) => sum + (s.current_enrollment || 0), 0),
      capacity_utilization: allSessions.length > 0 && allSessions.some(s => s.max_capacity > 0)
        ? Math.round((allSessions.reduce((sum, s) => {
            if (s.max_capacity > 0) {
              return sum + (s.current_enrollment / s.max_capacity);
            }
            return sum;
          }, 0) / allSessions.filter(s => s.max_capacity > 0).length) * 100)
        : 0,
      sessions_by_day: {},
      attendance_marked: allSessions.filter(s => s.attendance_marked).length,
      coach_workload: {},
      facility_usage: {},
      peak_hours: {},
      sessions_by_program: {}
    };

    // Group by day of week
    allSessions.forEach(session => {
      stats.sessions_by_day[session.day_of_week] = (stats.sessions_by_day[session.day_of_week] || 0) + 1;
    });

    // Coach workload distribution
    allSessions.forEach(session => {
      if (session.coach) {
        const coachName = session.coach.name_ar || `${session.coach.first_name} ${session.coach.last_name}`;
        if (!stats.coach_workload[coachName]) {
          stats.coach_workload[coachName] = {
            total_sessions: 0,
            active_sessions: 0,
            cancelled_sessions: 0,
            total_hours: 0
          };
        }
        stats.coach_workload[coachName].total_sessions++;
        if (session.is_cancelled) {
          stats.coach_workload[coachName].cancelled_sessions++;
        } else {
          stats.coach_workload[coachName].active_sessions++;
        }

        // Calculate session duration in hours
        if (session.start_time && session.end_time) {
          const startHour = parseInt(session.start_time.split(':')[0]);
          const startMin = parseInt(session.start_time.split(':')[1]);
          const endHour = parseInt(session.end_time.split(':')[0]);
          const endMin = parseInt(session.end_time.split(':')[1]);
          const duration = (endHour + endMin / 60) - (startHour + startMin / 60);
          stats.coach_workload[coachName].total_hours += duration;
        }
      }
    });

    // Facility usage
    allSessions.forEach(session => {
      if (session.facility) {
        if (!stats.facility_usage[session.facility]) {
          stats.facility_usage[session.facility] = {
            total_sessions: 0,
            active_sessions: 0,
            utilization_percentage: 0
          };
        }
        stats.facility_usage[session.facility].total_sessions++;
        if (!session.is_cancelled) {
          stats.facility_usage[session.facility].active_sessions++;
        }
      }
    });

    // Calculate facility utilization
    Object.keys(stats.facility_usage).forEach(facility => {
      const facilityStats = stats.facility_usage[facility];
      facilityStats.utilization_percentage = facilityStats.total_sessions > 0
        ? Math.round((facilityStats.active_sessions / facilityStats.total_sessions) * 100)
        : 0;
    });

    // Peak hours analysis (group by hour of day)
    allSessions.forEach(session => {
      if (session.start_time && !session.is_cancelled) {
        const hour = parseInt(session.start_time.split(':')[0]);
        const timeSlot = `${hour}:00`;
        stats.peak_hours[timeSlot] = (stats.peak_hours[timeSlot] || 0) + 1;
      }
    });

    // Sessions by program
    allSessions.forEach(session => {
      if (session.program) {
        const programName = session.program.name_ar || session.program.name;
        if (!stats.sessions_by_program[programName]) {
          stats.sessions_by_program[programName] = {
            total_sessions: 0,
            active_sessions: 0
          };
        }
        stats.sessions_by_program[programName].total_sessions++;
        if (!session.is_cancelled) {
          stats.sessions_by_program[programName].active_sessions++;
        }
      }
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get waitlist for a program
 * @route GET /api/schedule/program/:programId/waitlist
 */
exports.getProgramWaitlist = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { status } = req.query;

    const whereClause = { program_id: programId };
    if (status) {
      whereClause.status = status;
    }

    const waitlist = await Waitlist.findAll({
      where: whereClause,
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'name', 'name_ar', 'date_of_birth', 'gender']
        },
        {
          model: User,
          as: 'parent',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'phone', 'email']
        },
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'capacity', 'current_enrollment']
        }
      ],
      order: [['position', 'ASC']]
    });

    res.json({
      success: true,
      data: waitlist
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add player to waitlist
 * @route POST /api/schedule/program/:programId/waitlist
 */
exports.addToWaitlist = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { player_id, parent_id, notes } = req.body;

    // Get program and branch info
    const program = await Program.findByPk(programId, {
      attributes: ['id', 'name', 'name_ar', 'branch_id', 'capacity', 'current_enrollment']
    });

    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Program not found'
      });
    }

    // Check if program is full
    if (program.current_enrollment < program.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Program still has available spots. No need for waitlist.'
      });
    }

    // Check if player is already on waitlist
    const existingEntry = await Waitlist.findOne({
      where: {
        player_id,
        program_id: programId,
        status: { [Op.in]: ['waiting', 'notified'] }
      }
    });

    if (existingEntry) {
      return res.status(400).json({
        success: false,
        message: 'Player is already on the waitlist for this program'
      });
    }

    // Get the next position in the waitlist
    const maxPosition = await Waitlist.max('position', {
      where: { program_id: programId }
    });
    const nextPosition = (maxPosition || 0) + 1;

    // Create waitlist entry
    const waitlistEntry = await Waitlist.create({
      player_id,
      program_id: programId,
      branch_id: program.branch_id,
      parent_id,
      position: nextPosition,
      status: 'waiting',
      notes
    });

    // Fetch the created entry with associations
    const entry = await Waitlist.findByPk(waitlistEntry.id, {
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'name', 'name_ar', 'date_of_birth']
        },
        {
          model: User,
          as: 'parent',
          attributes: ['id', 'first_name', 'last_name', 'name_ar', 'phone']
        },
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar']
        }
      ]
    });

    // Emit real-time update
    emitWaitlistUpdate('added', {
      ...entry.toJSON(),
      branch_id: program.branch_id,
      program_id: programId
    });

    res.status(201).json({
      success: true,
      message: 'Player added to waitlist successfully',
      data: entry
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove player from waitlist
 * @route DELETE /api/schedule/waitlist/:waitlistId
 */
exports.removeFromWaitlist = async (req, res, next) => {
  try {
    const { waitlistId } = req.params;

    const entry = await Waitlist.findByPk(waitlistId);
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Waitlist entry not found'
      });
    }

    const programId = entry.program_id;
    const branchId = entry.branch_id;
    const position = entry.position;

    // Delete the entry
    await entry.destroy();

    // Reorder remaining waitlist entries
    await Waitlist.update(
      { position: Waitlist.sequelize.literal('position - 1') },
      {
        where: {
          program_id: programId,
          position: { [Op.gt]: position }
        }
      }
    );

    // Emit real-time update
    emitWaitlistUpdate('removed', {
      id: waitlistId,
      program_id: programId,
      branch_id: branchId
    });

    res.json({
      success: true,
      message: 'Player removed from waitlist successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update waitlist entry status
 * @route PATCH /api/schedule/waitlist/:waitlistId
 */
exports.updateWaitlistStatus = async (req, res, next) => {
  try {
    const { waitlistId } = req.params;
    const { status, notes } = req.body;

    const entry = await Waitlist.findByPk(waitlistId);
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Waitlist entry not found'
      });
    }

    const updateData = { status };
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Set timestamps based on status
    if (status === 'enrolled') {
      updateData.enrolled_at = new Date();
    } else if (status === 'cancelled' || status === 'expired') {
      // If cancelling or expiring, reorder remaining entries
      const programId = entry.program_id;
      const position = entry.position;

      await entry.update(updateData);

      // Reorder remaining waitlist entries
      await Waitlist.update(
        { position: Waitlist.sequelize.literal('position - 1') },
        {
          where: {
            program_id: programId,
            position: { [Op.gt]: position },
            status: 'waiting'
          }
        }
      );

      // Process waitlist to notify next person if needed
      await scheduleService.processWaitlist(programId);

      // Emit real-time update
      emitWaitlistUpdate('status-updated', {
        ...entry.toJSON(),
        branch_id: entry.branch_id,
        program_id: programId
      });

      return res.json({
        success: true,
        message: 'Waitlist status updated successfully',
        data: entry
      });
    }

    await entry.update(updateData);

    // Emit real-time update
    emitWaitlistUpdate('status-updated', {
      ...entry.toJSON(),
      branch_id: entry.branch_id
    });

    res.json({
      success: true,
      message: 'Waitlist status updated successfully',
      data: entry
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export branch schedule as iCal
 * @route GET /api/schedule/export/branch/:branchId/ical
 */
exports.exportBranchScheduleICal = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { startDate, endDate } = req.query;

    const whereClause = { branch_id: branchId, is_cancelled: false };

    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    } else {
      // Default to next 3 months
      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      whereClause.date = {
        [Op.between]: [today.toISOString().split('T')[0], threeMonthsLater.toISOString().split('T')[0]]
      };
    }

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar']
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar', 'address']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    // Create calendar
    const calendar = ical({
      name: `Training Schedule - ${sessions[0]?.branch?.name || 'Academy'}`,
      timezone: 'Asia/Riyadh'
    });

    // Add events
    sessions.forEach(session => {
      const startDateTime = new Date(`${session.date}T${session.start_time}`);
      const endDateTime = new Date(`${session.date}T${session.end_time}`);

      calendar.createEvent({
        start: startDateTime,
        end: endDateTime,
        summary: `${session.program?.name} - Training Session`,
        description: `Coach: ${session.coach?.first_name} ${session.coach?.last_name}${session.facility ? `\nFacility: ${session.facility}` : ''}${session.notes ? `\nNotes: ${session.notes}` : ''}`,
        location: session.branch?.address || session.facility || '',
        url: process.env.FRONTEND_URL || 'http://localhost:5173'
      });
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="schedule.ics"');
    res.send(calendar.toString());
  } catch (error) {
    next(error);
  }
};

/**
 * Export coach schedule as iCal
 * @route GET /api/schedule/export/coach/:coachId/ical
 */
exports.exportCoachScheduleICal = async (req, res, next) => {
  try {
    const { coachId } = req.params;
    const { startDate, endDate } = req.query;

    const whereClause = { coach_id: coachId, is_cancelled: false };

    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    } else {
      // Default to next 3 months
      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      whereClause.date = {
        [Op.between]: [today.toISOString().split('T')[0], threeMonthsLater.toISOString().split('T')[0]]
      };
    }

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar']
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar', 'address']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    const coachName = sessions[0]?.coach ? `${sessions[0].coach.first_name} ${sessions[0].coach.last_name}` : 'Coach';

    // Create calendar
    const calendar = ical({
      name: `${coachName} - Training Schedule`,
      timezone: 'Asia/Riyadh'
    });

    // Add events
    sessions.forEach(session => {
      const startDateTime = new Date(`${session.date}T${session.start_time}`);
      const endDateTime = new Date(`${session.date}T${session.end_time}`);

      calendar.createEvent({
        start: startDateTime,
        end: endDateTime,
        summary: `${session.program?.name} - Training`,
        description: `Branch: ${session.branch?.name}${session.facility ? `\nFacility: ${session.facility}` : ''}${session.notes ? `\nNotes: ${session.notes}` : ''}`,
        location: session.branch?.address || session.facility || '',
        url: process.env.FRONTEND_URL || 'http://localhost:5173'
      });
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${coachName.replace(/\s+/g, '_')}_schedule.ics"`);
    res.send(calendar.toString());
  } catch (error) {
    next(error);
  }
};

/**
 * Export single session as iCal
 * @route GET /api/schedule/export/session/:sessionId/ical
 */
exports.exportSessionICal = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await TrainingSession.findByPk(sessionId, {
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar']
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar', 'address']
        }
      ]
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    // Create calendar
    const calendar = ical({
      name: `${session.program?.name} - Training Session`,
      timezone: 'Asia/Riyadh'
    });

    const startDateTime = new Date(`${session.date}T${session.start_time}`);
    const endDateTime = new Date(`${session.date}T${session.end_time}`);

    calendar.createEvent({
      start: startDateTime,
      end: endDateTime,
      summary: `${session.program?.name} - Training Session`,
      description: `Coach: ${session.coach?.first_name} ${session.coach?.last_name}\nBranch: ${session.branch?.name}${session.facility ? `\nFacility: ${session.facility}` : ''}${session.notes ? `\nNotes: ${session.notes}` : ''}`,
      location: session.branch?.address || session.facility || '',
      url: process.env.FRONTEND_URL || 'http://localhost:5173'
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="session_${sessionId}.ics"`);
    res.send(calendar.toString());
  } catch (error) {
    next(error);
  }
};

/**
 * Export branch schedule as PDF
 * @route GET /api/schedule/export/branch/:branchId/pdf
 */
exports.exportBranchSchedulePDF = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { period = 'weekly' } = req.query; // daily, weekly, monthly

    const whereClause = { branch_id: branchId, is_cancelled: false };
    const today = new Date();
    let startDate, endDate, periodLabel;

    // Calculate date range based on period
    if (period === 'daily') {
      startDate = new Date(today);
      endDate = new Date(today);
      periodLabel = 'Daily Schedule';
    } else if (period === 'monthly') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      periodLabel = 'Monthly Schedule';
    } else { // weekly (default)
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      periodLabel = 'Weekly Schedule';
    }

    whereClause.date = {
      [Op.between]: [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    };

    const sessions = await TrainingSession.findAll({
      where: whereClause,
      include: [
        {
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'name_ar', 'type']
        },
        {
          model: User,
          as: 'coach',
          attributes: ['id', 'first_name', 'last_name', 'name_ar']
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'name_ar']
        }
      ],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="schedule_${branchId}.pdf"`);

    // Pipe the PDF to response
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text(periodLabel, { align: 'center' });
    doc.moveDown();

    if (sessions[0]?.branch) {
      doc.fontSize(14).text(sessions[0].branch.name, { align: 'center' });
      doc.moveDown();
    }

    // Add date range
    const dateRangeText = `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
    doc.fontSize(10).text(dateRangeText, { align: 'center' });
    doc.moveDown(2);

    // Group sessions by date
    const sessionsByDate = sessions.reduce((acc, session) => {
      const date = session.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(session);
      return acc;
    }, {});

    // Add sessions
    Object.entries(sessionsByDate).forEach(([date, dateSessions]) => {
      // Date header
      doc.fontSize(14).fillColor('#4F46E5').text(new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }));
      doc.moveDown(0.5);

      dateSessions.forEach(session => {
        doc.fontSize(10).fillColor('#000000');
        doc.text(`${session.start_time} - ${session.end_time}`, { continued: true });
        doc.text(` | ${session.program?.name || 'N/A'}`, { continued: true });
        doc.text(` | Coach: ${session.coach?.first_name} ${session.coach?.last_name || 'N/A'}`);
        if (session.facility) {
          doc.fontSize(9).fillColor('#666666').text(`   Facility: ${session.facility}`);
        }
        doc.moveDown(0.5);
      });

      doc.moveDown();
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
