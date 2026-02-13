const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const evaluationController = require('../controllers/evaluation.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/evaluations
 * @desc    Create a new evaluation
 * @access  Coach, Branch Admin, Owner, Super Admin
 */
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  [
    body('player_id').isUUID().withMessage('Valid player ID is required'),
    body('evaluation_type').optional().isIn(['quick', 'detailed']).withMessage('Invalid evaluation type'),
    body('overall_rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('goals').optional().isInt({ min: 0 }).withMessage('Goals must be a non-negative number'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
    body('session_id').optional().isUUID().withMessage('Invalid session ID'),
    body('evaluation_date').optional().isDate().withMessage('Invalid date'),
    // Skill ratings
    body('ball_control').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('passing').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('shooting').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('dribbling').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('speed').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('stamina').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('strength').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('agility').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('attitude').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('discipline').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('teamwork').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('effort').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  ],
  validate,
  evaluationController.createEvaluation
);

/**
 * @route   GET /api/evaluations
 * @desc    Get all evaluations (filtered by coach if coach role)
 * @access  Coach, Branch Admin, Owner, Super Admin
 */
router.get('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  [
    query('player_id').optional().isUUID().withMessage('Invalid player ID'),
    query('evaluation_type').optional().isIn(['quick', 'detailed']).withMessage('Invalid evaluation type'),
    query('from_date').optional().isDate().withMessage('Invalid from date'),
    query('to_date').optional().isDate().withMessage('Invalid to date'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  ],
  validate,
  evaluationController.getEvaluations
);

/**
 * @route   GET /api/evaluations/player/:playerId
 * @desc    Get all evaluations for a specific player
 * @access  Coach, Branch Admin, Owner, Super Admin
 */
router.get('/player/:playerId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.PARENT),
  [
    param('playerId').isUUID().withMessage('Invalid player ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  ],
  validate,
  evaluationController.getPlayerEvaluations
);

/**
 * @route   GET /api/evaluations/player/:playerId/summary
 * @desc    Get evaluation summary/stats for a player
 * @access  Coach, Branch Admin, Owner, Super Admin
 */
router.get('/player/:playerId/summary',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH, ROLES.PARENT),
  [
    param('playerId').isUUID().withMessage('Invalid player ID'),
  ],
  validate,
  evaluationController.getPlayerEvaluationSummary
);

/**
 * @route   GET /api/evaluations/:id
 * @desc    Get single evaluation by ID
 * @access  Coach, Branch Admin, Owner, Super Admin
 */
router.get('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  [
    param('id').isUUID().withMessage('Invalid evaluation ID'),
  ],
  validate,
  evaluationController.getEvaluation
);

/**
 * @route   PUT /api/evaluations/:id
 * @desc    Update an evaluation
 * @access  Coach (own only), Super Admin
 */
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  [
    param('id').isUUID().withMessage('Invalid evaluation ID'),
    body('overall_rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
    body('ball_control').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('passing').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('shooting').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('dribbling').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('speed').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('stamina').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('strength').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('agility').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('attitude').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('discipline').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('teamwork').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('effort').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  ],
  validate,
  evaluationController.updateEvaluation
);

/**
 * @route   DELETE /api/evaluations/:id
 * @desc    Delete an evaluation
 * @access  Coach (own only), Super Admin
 */
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN, ROLES.COACH),
  [
    param('id').isUUID().withMessage('Invalid evaluation ID'),
  ],
  validate,
  evaluationController.deleteEvaluation
);

module.exports = router;
