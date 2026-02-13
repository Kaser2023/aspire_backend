const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discount.controller');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Routes for super_admin, owner, accountant, and branch_admin
router.get('/', authorize('super_admin', 'owner', 'accountant', 'branch_admin'), discountController.getAllDiscounts);
router.get('/available', authorize('super_admin', 'owner', 'accountant', 'parent', 'self_player'), discountController.getAvailableDiscounts);
router.post('/', authorize('super_admin', 'owner', 'accountant', 'branch_admin'), discountController.createDiscount);
router.patch('/:id', authorize('super_admin', 'owner', 'accountant', 'branch_admin'), discountController.updateDiscount);

module.exports = router;
