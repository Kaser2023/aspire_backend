const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Super Admin Dashboard Stats
router.get('/super-admin',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  statsController.getSuperAdminStats
);

// Financial Stats (with date range and branch filter)
router.get('/financial',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  statsController.getFinancialStats
);

// Accountant Dashboard Stats
router.get('/accountant',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  statsController.getAccountantStats
);

// Branch Dashboard Stats
router.get('/branch/:branchId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  statsController.getBranchStats
);

// Coach Dashboard Stats
router.get('/coach/:coachId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  statsController.getCoachStats
);

// Parent Dashboard Stats
router.get('/parent/:parentId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.PARENT),
  statsController.getParentStats
);

module.exports = router;

