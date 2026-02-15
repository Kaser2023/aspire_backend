const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/schedule.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body, query, param } = require('express-validator');
const { ROLES } = require('../config/constants');
const { normalizeArabicNumerals } = require('../utils/helpers');
const normalizeNumerals = (v) => (typeof v === 'string' ? normalizeArabicNumerals(v) : v);

// All routes require authentication
router.use(authenticate);

// Get branch schedule (all sessions for a branch)
router.get('/branch/:branchId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT, ROLES.COACH, ROLES.PARENT),
  param('branchId').isUUID().withMessage('Invalid branch ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  query('endDate').optional().isDate().withMessage('Invalid end date'),
  query('programId').optional().isUUID().withMessage('Invalid program ID'),
  query('coachId').optional().isUUID().withMessage('Invalid coach ID'),
  query('isCancelled').optional().isBoolean().withMessage('isCancelled must be boolean'),
  validate,
  scheduleController.getBranchSchedule
);

// Get week schedule for a branch
router.get('/branch/:branchId/week',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT, ROLES.COACH, ROLES.PARENT),
  param('branchId').isUUID().withMessage('Invalid branch ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  validate,
  scheduleController.getWeekSchedule
);

// Get day schedule for a branch
router.get('/branch/:branchId/day',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.PARENT),
  param('branchId').isUUID().withMessage('Invalid branch ID'),
  query('date').optional().isDate().withMessage('Invalid date'),
  validate,
  scheduleController.getDaySchedule
);

// Get program schedule
router.get('/program/:programId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT, ROLES.COACH, ROLES.PARENT),
  param('programId').isUUID().withMessage('Invalid program ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  query('endDate').optional().isDate().withMessage('Invalid end date'),
  validate,
  scheduleController.getProgramSchedule
);

// Generate recurring sessions for a program
router.post('/program/:programId/generate',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  param('programId').isUUID().withMessage('Invalid program ID'),
  body('startDate').optional().isDate().withMessage('Invalid start date'),
  body('endDate').optional().isDate().withMessage('Invalid end date'),
  body('weeksAhead').optional().isInt({ min: 1, max: 52 }).withMessage('weeksAhead must be between 1 and 52'),
  validate,
  scheduleController.generateRecurringSessions
);

// Get coach weekly schedule
router.get('/coach/:coachId/week',
  param('coachId').isUUID().withMessage('Invalid coach ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  validate,
  scheduleController.getCoachSchedule
);

// Create a single training session
router.post('/session',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  [
    body('program_id').isUUID().withMessage('Program ID is required and must be valid'),
    body('coach_id').isUUID().withMessage('Coach ID is required and must be valid'),
    body('date').isDate().withMessage('Valid date is required'),
    body('start_time').customSanitizer(normalizeNumerals).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid start time is required (HH:MM or HH:MM:SS)'),
    body('end_time').customSanitizer(normalizeNumerals).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid end time is required (HH:MM or HH:MM:SS)'),
    body('facility').optional().isString().withMessage('Facility must be a string'),
    body('max_capacity').optional().customSanitizer(normalizeNumerals).isInt({ min: 1 }).withMessage('Max capacity must be a positive integer'),
    body('is_recurring').optional().isBoolean().withMessage('is_recurring must be boolean'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ],
  validate,
  scheduleController.createSession
);

// Update a training session
router.put('/session/:sessionId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
    body('coach_id').optional().isUUID().withMessage('Coach ID must be valid'),
    body('date').optional().isDate().withMessage('Valid date is required'),
    body('start_time').optional().customSanitizer(normalizeNumerals).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid start time is required (HH:MM or HH:MM:SS)'),
    body('end_time').optional().customSanitizer(normalizeNumerals).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid end time is required (HH:MM or HH:MM:SS)'),
    body('facility').optional().isString().withMessage('Facility must be a string'),
    body('max_capacity').optional().customSanitizer(normalizeNumerals).isInt({ min: 1 }).withMessage('Max capacity must be a positive integer'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ],
  validate,
  scheduleController.updateSession
);

// Cancel/Delete a training session
router.delete('/session/:sessionId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  [
    param('sessionId').isUUID().withMessage('Invalid session ID'),
    body('reason').optional().isString().withMessage('Reason must be a string'),
    body('permanent').optional().isBoolean().withMessage('permanent must be boolean')
  ],
  validate,
  scheduleController.cancelSession
);

// Validate session scheduling (check conflicts)
router.post('/validate',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  [
    body('coach_id').isUUID().withMessage('Coach ID is required and must be valid'),
    body('branch_id').isUUID().withMessage('Branch ID is required and must be valid'),
    body('facility').optional().isString().withMessage('Facility must be a string'),
    body('date').isDate().withMessage('Valid date is required'),
    body('start_time').customSanitizer(normalizeNumerals).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid start time is required (HH:MM or HH:MM:SS)'),
    body('end_time').customSanitizer(normalizeNumerals).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid end time is required (HH:MM or HH:MM:SS)'),
    body('session_id').optional().isUUID().withMessage('Session ID must be valid UUID')
  ],
  validate,
  scheduleController.validateSchedule
);

// Get schedule statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  query('branchId').optional().isUUID().withMessage('Invalid branch ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  query('endDate').optional().isDate().withMessage('Invalid end date'),
  validate,
  scheduleController.getScheduleStats
);

// ==================== Waitlist Routes ====================

// Get program waitlist
router.get('/program/:programId/waitlist',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  param('programId').isUUID().withMessage('Invalid program ID'),
  query('status').optional().isIn(['waiting', 'notified', 'enrolled', 'expired', 'cancelled']).withMessage('Invalid status'),
  validate,
  scheduleController.getProgramWaitlist
);

// Add player to waitlist
router.post('/program/:programId/waitlist',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.PARENT),
  param('programId').isUUID().withMessage('Invalid program ID'),
  [
    body('player_id').isUUID().withMessage('Player ID is required and must be valid'),
    body('parent_id').isUUID().withMessage('Parent ID is required and must be valid'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ],
  validate,
  scheduleController.addToWaitlist
);

// Remove player from waitlist
router.delete('/waitlist/:waitlistId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.PARENT),
  param('waitlistId').isUUID().withMessage('Invalid waitlist ID'),
  validate,
  scheduleController.removeFromWaitlist
);

// Update waitlist status
router.patch('/waitlist/:waitlistId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  param('waitlistId').isUUID().withMessage('Invalid waitlist ID'),
  [
    body('status').isIn(['waiting', 'notified', 'enrolled', 'expired', 'cancelled']).withMessage('Invalid status'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ],
  validate,
  scheduleController.updateWaitlistStatus
);

// ==================== Calendar Export Routes ====================

// Export branch schedule as iCal
router.get('/export/branch/:branchId/ical',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  param('branchId').isUUID().withMessage('Invalid branch ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  query('endDate').optional().isDate().withMessage('Invalid end date'),
  validate,
  scheduleController.exportBranchScheduleICal
);

// Export coach schedule as iCal
router.get('/export/coach/:coachId/ical',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  param('coachId').isUUID().withMessage('Invalid coach ID'),
  query('startDate').optional().isDate().withMessage('Invalid start date'),
  query('endDate').optional().isDate().withMessage('Invalid end date'),
  validate,
  scheduleController.exportCoachScheduleICal
);

// Export single session as iCal
router.get('/export/session/:sessionId/ical',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  param('sessionId').isUUID().withMessage('Invalid session ID'),
  validate,
  scheduleController.exportSessionICal
);

// Export branch schedule as PDF
router.get('/export/branch/:branchId/pdf',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  param('branchId').isUUID().withMessage('Invalid branch ID'),
  query('period').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Period must be daily, weekly, or monthly'),
  validate,
  scheduleController.exportBranchSchedulePDF
);

module.exports = router;
