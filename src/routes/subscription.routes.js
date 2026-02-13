const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { commonValidators } = require('../utils/validators');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all subscriptions
router.get('/',
  commonValidators.pagination,
  validate,
  subscriptionController.getAllSubscriptions
);

// Get subscription statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.getSubscriptionStats
);

// Get expiring subscriptions
router.get('/expiring',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.getExpiringSubscriptions
);

// Get overdue subscriptions
router.get('/overdue',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.getOverdueSubscriptions
);

// Get expiry summary (counts by urgency)
router.get('/expiry-summary',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.getExpirySummary
);

// Send bulk renewal reminders
router.post('/send-bulk-reminders',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.sendBulkReminders
);

// Get subscription by ID
router.get('/:id', subscriptionController.getSubscriptionById);

// Create new subscription
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.createSubscription
);

// Update subscription
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  subscriptionController.updateSubscription
);

// Renew subscription
router.post('/:id/renew',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.renewSubscription
);

// Apply discount to subscription
router.post('/:id/discount',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  subscriptionController.applyDiscount
);

// Cancel subscription
router.patch('/:id/cancel',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  subscriptionController.cancelSubscription
);

// Send renewal reminder for single subscription
router.post('/:id/send-reminder',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  subscriptionController.sendRenewalReminder
);

module.exports = router;
