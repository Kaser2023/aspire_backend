const express = require('express');
const router = express.Router();
const freezeController = require('../controllers/subscriptionFreeze.controller');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Routes for super_admin, owner, and branch_admin
router.get('/', authorize('super_admin', 'owner', 'branch_admin'), freezeController.getAllFreezes);
router.get('/active', authorize('super_admin', 'owner', 'accountant'), freezeController.getActiveFreezes);
router.post('/', authorize('super_admin', 'owner', 'branch_admin'), freezeController.createFreeze);
router.patch('/:id', authorize('super_admin', 'owner', 'branch_admin'), freezeController.updateFreeze);

module.exports = router;
