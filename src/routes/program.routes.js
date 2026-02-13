const express = require('express');
const router = express.Router();
const programController = require('../controllers/program.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { programValidators, commonValidators } = require('../utils/validators');
const { uploadProgramImage } = require('../middleware/upload');
const { ROLES } = require('../config/constants');

// Public routes
router.get('/public', programController.getPublicPrograms);

// Protected routes
router.use(authenticate);

// Get all programs
router.get('/',
  commonValidators.pagination,
  validate,
  programController.getAllPrograms
);

// Get program statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programController.getProgramStats
);

// Get program by ID
router.get('/:id', programController.getProgramById);

// Create new program
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programValidators.create,
  validate,
  programController.createProgram
);

// Update program
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programValidators.update,
  validate,
  programController.updateProgram
);

// Delete program
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER),
  programController.deleteProgram
);

// Upload program image
router.post('/:id/image',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  uploadProgramImage,
  programController.uploadImage
);

// Get program schedule
router.get('/:id/schedule', programController.getProgramSchedule);

// Update program schedule
router.put('/:id/schedule',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programController.updateProgramSchedule
);

// Get program players
router.get('/:id/players',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  programController.getProgramPlayers
);

// Coach assignment endpoints for many-to-many relationship
router.get('/:id/coaches',
  programController.getProgramCoaches
);

router.post('/:id/coaches',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programController.assignCoaches
);

router.delete('/:id/coaches/:coachId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programController.removeCoachFromProgram
);

// Assign coach to program (legacy - kept for backward compatibility)
router.post('/:id/assign-coach',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programController.assignCoach
);

// Toggle program status
router.patch('/:id/status',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  programController.toggleProgramStatus
);

module.exports = router;

