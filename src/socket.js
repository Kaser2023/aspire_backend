const { Server } = require('socket.io');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} httpServer - The HTTP server instance
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join room based on role and branch
    socket.on('join-attendance-room', (data) => {
      const { role, branch_id, user_id } = data;

      // Everyone joins the global attendance room
      socket.join('attendance-updates');

      // Branch-specific room
      if (branch_id) {
        socket.join(`branch-${branch_id}`);
      }

      // Role-specific room
      if (role) {
        socket.join(`role-${role}`);
      }

      // Role + branch specific room
      if (role && branch_id) {
        socket.join(`role-${role}-branch-${branch_id}`);
      }

      // User-specific room for direct notifications
      if (user_id) {
        socket.join(`user-${user_id}`);
      }

      console.log(`👤 User ${user_id} joined rooms: attendance-updates, branch-${branch_id}, role-${role}, role-${role}-branch-${branch_id}, user-${user_id}`);
    });

    // Join schedule room for real-time schedule updates
    socket.on('join-schedule-room', (data) => {
      const { branch_id, user_id } = data;

      // Everyone joins the global schedule room
      socket.join('schedule-updates');

      // Branch-specific schedule room
      if (branch_id) {
        socket.join(`schedule-branch-${branch_id}`);
      }

      console.log(`📅 User ${user_id} joined schedule rooms: schedule-updates, schedule-branch-${branch_id}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Get the Socket.IO instance
 * @returns {Server} The Socket.IO server instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocket first.');
  }
  return io;
};

/**
 * Emit attendance update to all connected clients
 * @param {string} eventType - Type of update: 'player' or 'coach'
 * @param {object} data - The attendance data
 */
const emitAttendanceUpdate = (eventType, data) => {
  if (!io) return;

  const event = `attendance-${eventType}-updated`;

  // Broadcast to all clients in attendance room
  io.to('attendance-updates').emit(event, {
    type: eventType,
    data: data,
    timestamp: new Date().toISOString()
  });

  // Also emit to specific branch if provided
  if (data.branch_id) {
    io.to(`branch-${data.branch_id}`).emit(event, {
      type: eventType,
      data: data,
      timestamp: new Date().toISOString()
    });
  }

  console.log(`📡 Emitted ${event} to attendance-updates room`);
};

/**
 * Emit schedule update to all connected clients
 * @param {string} eventType - Type of update: 'created', 'updated', 'cancelled', 'deleted'
 * @param {object} data - The session data
 */
const emitScheduleUpdate = (eventType, data) => {
  if (!io) return;

  const event = `schedule-${eventType}`;

  const payload = {
    type: eventType,
    data: data,
    timestamp: new Date().toISOString()
  };

  // Broadcast to all clients in schedule room
  io.to('schedule-updates').emit(event, payload);

  // Also emit to specific branch if provided
  if (data.branch_id) {
    io.to(`schedule-branch-${data.branch_id}`).emit(event, payload);
  }

  console.log(`📡 Emitted ${event} to schedule rooms`);
};

/**
 * Emit waitlist update to all connected clients
 * @param {string} eventType - Type of update: 'added', 'removed', 'status-updated'
 * @param {object} data - The waitlist data
 */
const emitWaitlistUpdate = (eventType, data) => {
  if (!io) return;

  const event = `waitlist-${eventType}`;

  const payload = {
    type: eventType,
    data: data,
    timestamp: new Date().toISOString()
  };

  // Broadcast to all clients in schedule room
  io.to('schedule-updates').emit(event, payload);

  // Also emit to specific branch if provided
  if (data.branch_id) {
    io.to(`schedule-branch-${data.branch_id}`).emit(event, payload);
  }

  console.log(`📡 Emitted ${event} to schedule rooms`);
};

/**
 * Emit announcement created event to targeted rooms
 * @param {object} payload - Announcement payload
 * @param {object} audience - target_audience payload
 */
const emitAnnouncementCreated = (payload, audience) => {
  if (!io) return;

  const event = 'announcement-created';
  const message = {
    data: payload,
    timestamp: new Date().toISOString()
  };

  const audienceType = audience?.type || (typeof audience === 'string' ? 'legacy' : 'all');
  const branchId = payload?.target_branch_id;

  // Helper to emit to a specific role (optionally scoped to branch)
  // When targeting 'player' role, also notify 'parent' role since parents manage player accounts
  const emitToRole = (role, scopedBranchId) => {
    const bId = scopedBranchId || branchId;
    if (bId) {
      io.to(`role-${role}-branch-${bId}`).emit(event, message);
      if (role === 'player') {
        io.to(`role-parent-branch-${bId}`).emit(event, message);
      }
    } else {
      io.to(`role-${role}`).emit(event, message);
      if (role === 'player') {
        io.to(`role-parent`).emit(event, message);
      }
    }
  };

  if (audienceType === 'all') {
    // Send to all roles
    ['branch_admin', 'parent', 'player', 'coach', 'accountant'].forEach(r => emitToRole(r));
    return;
  }

  if (audienceType === 'roles') {
    const roles = audience.roles || [];
    roles.forEach(r => emitToRole(r));
    return;
  }

  if (audienceType === 'specific') {
    const branches = audience.branches || {};
    Object.keys(branches).forEach((bId) => {
      const branchData = branches[bId] || {};
      (branchData.roles || []).forEach((role) => {
        emitToRole(role, bId);
      });
    });
    // Also emit to specific users if any
    const users = audience.users || [];
    if (users.length > 0) {
      console.log(`📢 Emitting to specific users: ${users.length} users`);
      users.forEach((userId) => {
        io.to(`user-${userId}`).emit(event, message);
      });
    }
    return;
  }

  if (audienceType === 'legacy') {
    if (audience === 'all') {
      ['branch_admin', 'parent', 'player', 'coach', 'accountant'].forEach(r => emitToRole(r));
    } else if (audience === 'staff') {
      ['branch_admin', 'coach', 'accountant'].forEach(r => emitToRole(r));
    } else {
      emitToRole(audience);
    }
  }
};

/**
 * Emit notification to specific roles and/or branches
 * @param {object} options - Notification options
 * @param {object} options.data - The notification data
 * @param {string[]} options.roles - Roles to notify (e.g. ['super_admin', 'branch_admin'])
 * @param {string} options.branchId - Branch ID for branch-scoped notifications
 */
const emitNotification = ({ data, roles = [], branchId }) => {
  if (!io) return;

  const event = 'notification-created';
  const payload = {
    data,
    timestamp: new Date().toISOString()
  };

  roles.forEach(role => {
    if (role === 'branch_admin' && branchId) {
      // Branch admin gets branch-scoped notification
      io.to(`role-${role}-branch-${branchId}`).emit(event, payload);
    } else {
      // Super admin and others get global role notification
      io.to(`role-${role}`).emit(event, payload);
    }
  });

  console.log(`🔔 Emitted ${event} to roles: ${roles.join(', ')}${branchId ? ` (branch: ${branchId})` : ''}`);
};

module.exports = {
  initSocket,
  getIO,
  emitAttendanceUpdate,
  emitScheduleUpdate,
  emitWaitlistUpdate,
  emitAnnouncementCreated,
  emitNotification
};
