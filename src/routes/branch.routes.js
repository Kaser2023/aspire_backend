const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branch.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { branchValidators, commonValidators } = require('../utils/validators');
const { ROLES } = require('../config/constants');

// Public routes (for landing page)
router.get('/public', branchController.getPublicBranches);

// Protected routes
router.use(authenticate);

// Get all branches
router.get('/',
  commonValidators.pagination,
  validate,
  branchController.getAllBranches
);

// Get branch statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  branchController.getBranchStats
);

// Get branch by ID
router.get('/:id', branchController.getBranchById);

// Create new branch
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  branchValidators.create,
  validate,
  branchController.createBranch
);

// Update branch
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  branchValidators.update,
  validate,
  branchController.updateBranch
);

// Delete branch
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  branchController.deleteBranch
);

// Get branch programs
router.get('/:id/programs', branchController.getBranchPrograms);

// Get branch players
router.get('/:id/players',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  branchController.getBranchPlayers
);

// Get branch staff
router.get('/:id/staff',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  branchController.getBranchStaff
);

// Assign manager to branch
router.post('/:id/assign-manager',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  branchController.assignManager
);

// Toggle branch status
router.patch('/:id/status',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  branchController.toggleBranchStatus
);

module.exports = router;

