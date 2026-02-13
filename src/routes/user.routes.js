const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { userValidators, commonValidators } = require('../utils/validators');
const { uploadAvatar } = require('../middleware/upload');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all users (admin only)
router.get('/', 
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  commonValidators.pagination,
  validate,
  userController.getAllUsers
);

// Update current user's profile
router.put('/profile',
  userController.updateProfile
);

// Get audience tree for announcement targeting - MUST be before /:id
router.get('/audience-tree',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  userController.getAudienceTree
);

// Get users by role - MUST be before /:id to avoid conflict
router.get('/role/:role',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  userController.getUsersByRole
);

// Get users by branch - MUST be before /:id to avoid conflict
router.get('/branch/:branchId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT),
  userController.getUsersByBranch
);

// Get user by ID
router.get('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  userController.getUserById
);

// Create new user (admin only)
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  userValidators.create,
  validate,
  userController.createUser
);

// Update user
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  userValidators.update,
  validate,
  userController.updateUser
);

// Delete user (soft delete)
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  userController.deleteUser
);

// Upload avatar
router.post('/:id/avatar',
  uploadAvatar,
  userController.uploadAvatar
);

// Activate/Deactivate user
router.patch('/:id/status',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  userController.toggleUserStatus
);

module.exports = router;

