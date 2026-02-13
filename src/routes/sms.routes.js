const express = require('express');
const router = express.Router();
const smsController = require('../controllers/sms.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { smsValidators, commonValidators } = require('../utils/validators');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all SMS messages
router.get('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  commonValidators.pagination,
  validate,
  smsController.getAllSMS
);

// Get SMS statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  smsController.getSMSStats
);

// Get SMS templates
router.get('/templates/list',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.getTemplates
);

// Get SMS balance
router.get('/account/balance',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  smsController.getBalance
);

// Get scheduler status
router.get('/scheduler-status',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  smsController.getSchedulerStatus
);

// ==================== AUTO SMS SETTINGS ====================

// Get all auto SMS settings
router.get('/auto-settings',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  smsController.getAutoSMSSettings
);

// Create auto SMS setting
router.post('/auto-settings',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  smsController.createAutoSMSSetting
);

// Get auto SMS setting by ID
router.get('/auto-settings/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  smsController.getAutoSMSSettingById
);

// Update auto SMS setting
router.put('/auto-settings/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  smsController.updateAutoSMSSetting
);

// Delete auto SMS setting
router.delete('/auto-settings/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  smsController.deleteAutoSMSSetting
);

// Trigger auto SMS manually (testing)
router.post('/trigger-auto',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  smsController.triggerAutoSMS
);

// Get SMS by ID (must be after all other specific routes)
router.get('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.getSMSById
);

// Update SMS message
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.updateSMS
);

// Delete SMS message
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.deleteSMS
);

// Send SMS
router.post('/send',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsValidators.send,
  validate,
  smsController.sendSMS
);

// Send bulk SMS to branch
router.post('/send-branch',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.sendToBranch
);

// Send bulk SMS to program
router.post('/send-program',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.sendToProgram
);

// Schedule SMS
router.post('/schedule',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.scheduleSMS
);

// Cancel scheduled SMS
router.delete('/:id/cancel',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  smsController.cancelScheduledSMS
);

module.exports = router;

