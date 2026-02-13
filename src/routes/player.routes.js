const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { playerValidators, commonValidators } = require('../utils/validators');
const { uploadAvatar, uploadDocument } = require('../middleware/upload');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all players
router.get('/',
  commonValidators.pagination,
  validate,
  playerController.getAllPlayers
);

// Link player to parent by registration code
router.post('/link', playerController.linkPlayer);

// Get player statistics - MUST be before /:id
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  playerController.getPlayerStats
);

// Get players by parent - MUST be before /:id
router.get('/parent/:parentId', playerController.getPlayersByParent);

// Get players by branch - MUST be before /:id
router.get('/branch/:branchId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  playerController.getPlayersByBranch
);

// Get players by program - MUST be before /:id
router.get('/program/:programId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  playerController.getPlayersByProgram
);

// Get player by ID
router.get('/:id', playerController.getPlayerById);

// Create new player
router.post('/',
  playerValidators.create,
  validate,
  playerController.createPlayer
);

// Update player
router.put('/:id',
  playerValidators.update,
  validate,
  playerController.updatePlayer
);

// Delete player
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  playerController.deletePlayer
);

// Upload player avatar
router.post('/:id/avatar',
  uploadAvatar,
  playerController.uploadAvatar
);

// Upload player ID document
router.post('/:id/id-document',
  uploadDocument,
  playerController.uploadIdDocument
);

// Update player status
router.patch('/:id/status',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  playerController.updatePlayerStatus
);

// Assign player to program
router.post('/:id/assign-program',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  playerController.assignToProgram
);

module.exports = router;

