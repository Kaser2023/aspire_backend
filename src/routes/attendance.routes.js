const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { attendanceValidators, commonValidators } = require('../utils/validators');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all attendance records
router.get('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  commonValidators.pagination,
  validate,
  attendanceController.getAllAttendance
);

// Get attendance statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.getAttendanceStats
);

// Get attendance by date
router.get('/date/:date',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.getAttendanceByDate
);

// ===== COACH ATTENDANCE ROUTES (must be before /:id) =====

// Get coach attendance by date
router.get('/coach',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.getCoachAttendance
);

// Get coach attendance stats
router.get('/coach/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.getCoachAttendanceStats
);

// Get coach attendance summary (for reports)
router.get('/coach/summary',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.getCoachAttendanceSummary
);

// Record/Update coach attendance
router.post('/coach',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.recordCoachAttendance
);

// Bulk record coach attendance
router.post('/coach/bulk',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.bulkRecordCoachAttendance
);

// Initialize coach attendance for a date
router.post('/coach/init',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.initCoachAttendance
);

// ===== PLAYER ATTENDANCE ROUTES (Super Admin) =====

// Get players list for attendance (with existing attendance status)
router.get('/players/list',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.getPlayersForAttendance
);

// Initialize player attendance for a date
router.post('/players/init',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.initPlayerAttendance
);

// Bulk record player attendance
router.post('/players/bulk',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.bulkRecordPlayerAttendance
);

// Get attendance by ID (must be after specific routes like /coach)
router.get('/:id', attendanceController.getAttendanceById);

// Record single attendance
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceValidators.record,
  validate,
  attendanceController.recordAttendance
);

// Bulk record attendance
router.post('/bulk',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceValidators.bulkRecord,
  validate,
  attendanceController.bulkRecordAttendance
);

// Update attendance
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.updateAttendance
);

// Delete attendance record
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  attendanceController.deleteAttendance
);

// Get attendance by player
router.get('/player/:playerId', attendanceController.getAttendanceByPlayer);

// Get attendance by program
router.get('/program/:programId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.getAttendanceByProgram
);

// Get attendance summary for a player
router.get('/player/:playerId/summary', attendanceController.getPlayerAttendanceSummary);

// Get attendance report
router.get('/report/:programId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.ACCOUNTANT),
  attendanceController.getAttendanceReport
);

module.exports = router;

