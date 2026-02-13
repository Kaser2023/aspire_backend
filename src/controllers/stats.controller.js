const { 
  User, Branch, Program, Player, Subscription, 
  Payment, Attendance, TrainingSession, sequelize 
} = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { ROLES, PAYMENT_STATUS, PLAYER_STATUS } = require('../config/constants');

/**
 * @desc    Get super admin dashboard statistics
 * @route   GET /api/stats/super-admin
 * @access  Private/SuperAdmin/Owner
 */
exports.getSuperAdminStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [
    totalPlayers,
    totalCoaches,
    totalBranches,
    totalPrograms,
    revenueThisMonth,
    pendingPayments,
    overdueSubscriptions,
    newRegistrationsThisWeek,
    activeSubscriptions,
    totalParents
  ] = await Promise.all([
    // Total active players
    Player.count({ where: { status: PLAYER_STATUS.ACTIVE } }),
    
    // Total coaches
    User.count({ where: { role: ROLES.COACH, is_active: true } }),
    
    // Total active branches
    Branch.count({ where: { is_active: true } }),
    
    // Total active programs
    Program.count({ where: { is_active: true } }),
    
    // Revenue this month
    Payment.sum('total_amount', {
      where: {
        status: PAYMENT_STATUS.COMPLETED,
        paid_at: { [Op.gte]: startOfMonth }
      }
    }),
    
    // Pending payments count
    Payment.count({ where: { status: PAYMENT_STATUS.PENDING } }),
    
    // Overdue subscriptions (expired but player still active)
    Subscription.count({
      where: {
        status: 'expired',
        end_date: { [Op.lt]: now }
      },
      include: [{
        association: 'player',
        where: { status: PLAYER_STATUS.ACTIVE },
        required: true
      }]
    }),
    
    // New registrations this week
    Player.count({
      where: {
        created_at: { [Op.gte]: startOfWeek }
      }
    }),
    
    // Active subscriptions
    Subscription.count({ where: { status: 'active' } }),
    
    // Total parents
    User.count({ where: { role: ROLES.PARENT, is_active: true } })
  ]);

  // Revenue by branch this month
  const revenueByBranch = await Payment.findAll({
    where: {
      status: PAYMENT_STATUS.COMPLETED,
      paid_at: { [Op.gte]: startOfMonth }
    },
    attributes: [
      'branch_id',
      [sequelize.fn('SUM', sequelize.col('total_amount')), 'total']
    ],
    include: [{ association: 'branch', attributes: ['name'] }],
    group: ['branch_id', 'branch.id', 'branch.name']
  });

  res.json({
    success: true,
    data: {
      total_players: totalPlayers,
      total_coaches: totalCoaches,
      total_branches: totalBranches,
      total_programs: totalPrograms,
      total_parents: totalParents,
      active_subscriptions: activeSubscriptions,
      revenue_this_month: revenueThisMonth || 0,
      pending_payments: pendingPayments,
      overdue_subscriptions: overdueSubscriptions,
      new_registrations_this_week: newRegistrationsThisWeek,
      revenue_by_branch: revenueByBranch.map(r => ({
        branch_id: r.branch_id,
        branch_name: r.branch?.name || 'Unknown',
        total: parseFloat(r.get('total')) || 0
      }))
    }
  });
});

/**
 * @desc    Get branch dashboard statistics
 * @route   GET /api/stats/branch/:branchId
 * @access  Private/BranchAdmin
 */
exports.getBranchStats = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toISOString().split('T')[0];

  // Verify branch exists
  const branch = await Branch.findByPk(branchId);
  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  const [
    playerCount,
    coachCount,
    programCount,
    revenueThisMonth,
    pendingRegistrations,
    todayAttendance,
    totalTodaySessions
  ] = await Promise.all([
    // Players in this branch
    Player.count({ 
      where: { branch_id: branchId, status: PLAYER_STATUS.ACTIVE } 
    }),
    
    // Coaches in this branch
    User.count({ 
      where: { branch_id: branchId, role: ROLES.COACH, is_active: true } 
    }),
    
    // Programs in this branch
    Program.count({ 
      where: { branch_id: branchId, is_active: true } 
    }),
    
    // Revenue this month for this branch
    Payment.sum('total_amount', {
      where: {
        branch_id: branchId,
        status: PAYMENT_STATUS.COMPLETED,
        paid_at: { [Op.gte]: startOfMonth }
      }
    }),
    
    // Pending subscription payments
    Payment.count({
      where: {
        branch_id: branchId,
        status: PAYMENT_STATUS.PENDING
      }
    }),
    
    // Today's attendance (present + late)
    Attendance.count({
      where: {
        session_date: today,
        status: { [Op.in]: ['present', 'late'] }
      },
      include: [{
        association: 'program',
        where: { branch_id: branchId },
        required: true
      }]
    }),
    
    // Total expected today
    Attendance.count({
      where: { session_date: today },
      include: [{
        association: 'program',
        where: { branch_id: branchId },
        required: true
      }]
    })
  ]);

  const todayAttendanceRate = totalTodaySessions > 0 
    ? ((todayAttendance / totalTodaySessions) * 100).toFixed(1) 
    : 0;

  res.json({
    success: true,
    data: {
      branch_id: branchId,
      branch_name: branch.name,
      player_count: playerCount,
      coach_count: coachCount,
      program_count: programCount,
      revenue_this_month: revenueThisMonth || 0,
      pending_registrations: pendingRegistrations,
      today_attendance: todayAttendance,
      today_attendance_rate: parseFloat(todayAttendanceRate)
    }
  });
});

/**
 * @desc    Get coach dashboard statistics
 * @route   GET /api/stats/coach/:coachId
 * @access  Private/Coach
 */
exports.getCoachStats = asyncHandler(async (req, res) => {
  const { coachId } = req.params;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  // Verify coach exists
  const coach = await User.findByPk(coachId);
  if (!coach || coach.role !== ROLES.COACH) {
    throw new AppError('Coach not found', 404);
  }

  // Get today's sessions count directly from TrainingSession
  const todaySessionsCount = await TrainingSession.count({
    where: {
      coach_id: coachId,
      date: today,
      is_cancelled: false
    }
  });

  // Get coach's training sessions (to find programs for attendance stats)
  const coachSessions = await TrainingSession.findAll({
    where: { coach_id: coachId },
    attributes: ['program_id'],
    group: ['program_id']
  });

  const programIds = [...new Set(coachSessions.map(s => s.program_id))];

  const [
    assignedPlayersCount,
    weeklyAttendance,
    weeklyTotal,
    programs
  ] = await Promise.all([
    // Total players directly assigned to this coach (only ACTIVE status)
    Player.count({
      where: { 
        coach_id: coachId,
        status: PLAYER_STATUS.ACTIVE
      }
    }),
    
    // Weekly attendance (present + late)
    programIds.length > 0 ? Attendance.count({
      where: {
        program_id: { [Op.in]: programIds },
        session_date: { [Op.gte]: startOfWeek.toISOString().split('T')[0] },
        status: { [Op.in]: ['present', 'late'] }
      }
    }) : 0,
    
    // Weekly total attendance records
    programIds.length > 0 ? Attendance.count({
      where: {
        program_id: { [Op.in]: programIds },
        session_date: { [Op.gte]: startOfWeek.toISOString().split('T')[0] }
      }
    }) : 0,

    // Get programs info
    programIds.length > 0 ? Program.findAll({
      where: { id: { [Op.in]: programIds }, is_active: true },
      attributes: ['id', 'name', 'schedule', 'current_enrollment']
    }) : []
  ]);

  const weeklyAttendanceRate = weeklyTotal > 0 
    ? ((weeklyAttendance / weeklyTotal) * 100).toFixed(1) 
    : 0;

  // Calculate upcoming sessions
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const upcomingSessions = programs.filter(p => {
    const schedule = p.schedule || [];
    return schedule.some(s => s.day?.toLowerCase() === dayOfWeek);
  });

  res.json({
    success: true,
    data: {
      coach_id: coachId,
      coach_name: `${coach.first_name} ${coach.last_name}`,
      assigned_players_count: assignedPlayersCount,
      programs_count: programs.length,
      today_sessions: todaySessionsCount,
      weekly_attendance_rate: parseFloat(weeklyAttendanceRate),
      upcoming_sessions: upcomingSessions.map(p => ({
        program_id: p.id,
        program_name: p.name,
        players: p.current_enrollment
      }))
    }
  });
});

/**
 * @desc    Get parent dashboard statistics
 * @route   GET /api/stats/parent/:parentId
 * @access  Private/Parent
 */
exports.getParentStats = asyncHandler(async (req, res) => {
  const { parentId } = req.params;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Verify parent exists
  const parent = await User.findByPk(parentId);
  if (!parent || parent.role !== ROLES.PARENT) {
    throw new AppError('Parent not found', 404);
  }

  // Get children (also find by self_user_id for self-players)
  const children = await Player.findAll({
    where: { [Op.or]: [{ parent_id: parentId }, { self_user_id: parentId }] },
    include: [
      { association: 'program', attributes: ['id', 'name', 'schedule'] },
      { association: 'subscriptions', where: { status: 'active' }, required: false }
    ]
  });

  const childrenIds = children.map(c => c.id);

  const [
    activeSubscriptions,
    pendingPayments,
    thisMonthAttendance,
    thisMonthTotal
  ] = await Promise.all([
    // Active subscriptions
    Subscription.count({
      where: {
        player_id: { [Op.in]: childrenIds },
        status: 'active'
      }
    }),
    
    // Pending payments
    Payment.findAll({
      where: {
        player_id: { [Op.in]: childrenIds },
        status: PAYMENT_STATUS.PENDING
      },
      attributes: ['id', 'invoice_number', 'total_amount', 'due_date'],
      include: [{ association: 'player', attributes: ['first_name', 'last_name'] }]
    }),
    
    // This month attendance
    Attendance.count({
      where: {
        player_id: { [Op.in]: childrenIds },
        session_date: { [Op.gte]: startOfMonth.toISOString().split('T')[0] },
        status: { [Op.in]: ['present', 'late'] }
      }
    }),
    
    // Total sessions this month
    Attendance.count({
      where: {
        player_id: { [Op.in]: childrenIds },
        session_date: { [Op.gte]: startOfMonth.toISOString().split('T')[0] }
      }
    })
  ]);

  // Calculate upcoming sessions from training sessions
  const upcomingSessions = [];
  const programIds = children
    .map(child => child.program?.id)
    .filter(Boolean);

  if (programIds.length > 0) {
    const sessions = await TrainingSession.findAll({
      where: {
        program_id: { [Op.in]: programIds },
        date: { [Op.gte]: today },
        is_cancelled: false
      },
      attributes: ['program_id', 'date', 'start_time'],
      order: [['date', 'ASC'], ['start_time', 'ASC']]
    });

    const firstSessionByProgram = {};
    sessions.forEach((session) => {
      if (!firstSessionByProgram[session.program_id]) {
        firstSessionByProgram[session.program_id] = session;
      }
    });

    children.forEach((child) => {
      if (!child.program?.id) return;
      const session = firstSessionByProgram[child.program.id];
      if (!session) return;
      upcomingSessions.push({
        player_name: `${child.first_name} ${child.last_name}`.trim(),
        program_name: child.program.name,
        date: session.date,
        time: session.start_time
      });
    });
  }

  const attendanceRate = thisMonthTotal > 0 
    ? ((thisMonthAttendance / thisMonthTotal) * 100).toFixed(1) 
    : 0;

  res.json({
    success: true,
    data: {
      parent_id: parentId,
      children_count: children.length,
      children: children.map(c => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        status: c.status,
        program: c.program?.name || 'Not enrolled'
      })),
      active_subscriptions: activeSubscriptions,
      pending_payments: pendingPayments.map(p => ({
        id: p.id,
        invoice_number: p.invoice_number,
        amount: p.total_amount,
        due_date: p.due_date,
        player_name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`
      })),
      upcoming_sessions: upcomingSessions,
      attendance_summary: {
        this_month_rate: parseFloat(attendanceRate),
        present: thisMonthAttendance,
        total: thisMonthTotal
      }
    }
  });
});

/**
 * @desc    Get financial statistics
 * @route   GET /api/stats/financial
 * @access  Private/SuperAdmin/Accountant
 */
exports.getFinancialStats = asyncHandler(async (req, res) => {
  const { branch_id, from_date, to_date } = req.query;
  
  // Default to current month if no dates provided
  const now = new Date();
  const fromDate = from_date ? new Date(from_date) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = to_date ? new Date(to_date) : now;

  const where = {
    created_at: { [Op.between]: [fromDate, toDate] }
  };

  const completedWhere = {
    ...where,
    status: PAYMENT_STATUS.COMPLETED
  };

  const refundedWhere = {
    ...where,
    status: PAYMENT_STATUS.REFUNDED
  };

  if (branch_id) {
    where.branch_id = branch_id;
    completedWhere.branch_id = branch_id;
    refundedWhere.branch_id = branch_id;
  }

  const [
    totalIncome,
    totalRefunds,
    paymentCount,
    revenueByBranch,
    revenueByProgram,
    paymentMethodsBreakdown
  ] = await Promise.all([
    // Total income
    Payment.sum('total_amount', { where: completedWhere }),
    
    // Total refunds
    Payment.sum('total_amount', { where: refundedWhere }),
    
    // Payment count
    Payment.count({ where: completedWhere }),
    
    // Revenue by branch
    Payment.findAll({
      where: completedWhere,
      attributes: [
        'branch_id',
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'count']
      ],
      include: [{ association: 'branch', attributes: ['name', 'code'] }],
      group: ['branch_id', 'branch.id', 'branch.name', 'branch.code']
    }),
    
    // Revenue by program (through subscriptions)
    Payment.findAll({
      where: { ...completedWhere, type: 'subscription' },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('Payment.total_amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'count']
      ],
      include: [{
        association: 'subscription',
        attributes: [],
        include: [{
          association: 'program',
          attributes: ['id', 'name']
        }]
      }],
      group: ['subscription.program.id', 'subscription.program.name']
    }),
    
    // Payment methods breakdown
    Payment.findAll({
      where: completedWhere,
      attributes: [
        'payment_method',
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['payment_method']
    })
  ]);

  const netRevenue = (totalIncome || 0) - (totalRefunds || 0);

  res.json({
    success: true,
    data: {
      period: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0]
      },
      total_income: totalIncome || 0,
      total_refunds: totalRefunds || 0,
      net_revenue: netRevenue,
      payment_count: paymentCount,
      revenue_by_branch: revenueByBranch.map(r => ({
        branch_id: r.branch_id,
        branch_name: r.branch?.name || 'Unknown',
        branch_code: r.branch?.code,
        total: parseFloat(r.get('total')) || 0,
        count: parseInt(r.get('count'))
      })),
      revenue_by_program: revenueByProgram.map(r => ({
        program_id: r.subscription?.program?.id,
        program_name: r.subscription?.program?.name || 'Unknown',
        total: parseFloat(r.get('total')) || 0,
        count: parseInt(r.get('count'))
      })),
      payment_methods_breakdown: paymentMethodsBreakdown.map(p => ({
        method: p.payment_method,
        total: parseFloat(p.get('total')) || 0,
        count: parseInt(p.get('count'))
      }))
    }
  });
});

/**
 * @desc    Get accountant dashboard statistics
 * @route   GET /api/stats/accountant
 * @access  Private/Accountant
 */
exports.getAccountantStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toISOString().split('T')[0];

  const [
    totalRevenueThisMonth,
    pendingPaymentsAmount,
    pendingPaymentsCount,
    todayPayments,
    todayRevenue,
    overduePayments
  ] = await Promise.all([
    // Total revenue this month
    Payment.sum('total_amount', {
      where: {
        status: PAYMENT_STATUS.COMPLETED,
        paid_at: { [Op.gte]: startOfMonth }
      }
    }),
    
    // Pending payments amount
    Payment.sum('total_amount', {
      where: { status: PAYMENT_STATUS.PENDING }
    }),
    
    // Pending payments count
    Payment.count({
      where: { status: PAYMENT_STATUS.PENDING }
    }),
    
    // Today's payments count
    Payment.count({
      where: {
        status: PAYMENT_STATUS.COMPLETED,
        paid_at: { [Op.gte]: new Date(today) }
      }
    }),
    
    // Today's revenue
    Payment.sum('total_amount', {
      where: {
        status: PAYMENT_STATUS.COMPLETED,
        paid_at: { [Op.gte]: new Date(today) }
      }
    }),
    
    // Overdue payments (past due date and still pending)
    Payment.count({
      where: {
        status: PAYMENT_STATUS.PENDING,
        due_date: { [Op.lt]: today }
      }
    })
  ]);

  res.json({
    success: true,
    data: {
      total_revenue_this_month: totalRevenueThisMonth || 0,
      pending_payments: {
        count: pendingPaymentsCount,
        amount: pendingPaymentsAmount || 0
      },
      today: {
        payments_count: todayPayments,
        revenue: todayRevenue || 0
      },
      overdue_payments_count: overduePayments
    }
  });
});

