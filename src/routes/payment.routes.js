const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { paymentValidators, commonValidators } = require('../utils/validators');
const { ROLES } = require('../config/constants');

// ═══════════════════════════════════════════════════════════════
//  PUBLIC GATEWAY ROUTES (no auth - called by gateway)
// ═══════════════════════════════════════════════════════════════

// Get gateway configuration (public - returns publishable keys only)
router.get('/gateway/config', paymentController.getGatewayConfig);

// Payment callback from gateway (public - redirected from gateway)
router.get('/gateway/callback', paymentController.handleGatewayCallback);

// Payment webhook from gateway (public - called by gateway)
router.post('/gateway/webhook', paymentController.handleGatewayWebhook);

// All other routes require authentication
router.use(authenticate);

// Get all payments
router.get('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  commonValidators.pagination,
  validate,
  paymentController.getAllPayments
);

// Create payment with receipt (Parent)
router.post('/receipt',
  authorize(ROLES.PARENT),
  uploadReceipt,
  paymentController.createReceiptPayment
);

// Create payment with receipt (Admin/Accountant)
router.post('/admin/receipt',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  uploadReceipt,
  paymentController.createAdminReceiptPayment
);

// Get payment statistics
router.get('/stats',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.getPaymentStats
);

// Get revenue report
router.get('/revenue',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.getRevenueReport
);

// ═══════════════════════════════════════════════════════════════
//  ONLINE PAYMENT GATEWAY ROUTES (authenticated)
// ═══════════════════════════════════════════════════════════════

// Initiate online payment
router.post('/gateway/initiate',
  authorize(ROLES.PARENT),
  paymentController.initiateOnlinePayment
);

// Verify payment status with gateway
router.get('/gateway/verify/:paymentId', paymentController.verifyGatewayPayment);

// Process refund via gateway
router.post('/gateway/:paymentId/refund',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.processGatewayRefund
);

// Complete mock payment (development only)
router.post('/gateway/mock/:paymentId/complete', paymentController.completeMockPayment);

// Get payment by ID
router.get('/:id', paymentController.getPaymentById);

// Create new payment
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  paymentValidators.create,
  validate,
  paymentController.createPayment
);

// Update payment
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.updatePayment
);

// Delete payment
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.deletePayment
);

// Get payments by user
router.get('/user/:userId', paymentController.getPaymentsByUser);

// Get payments by player
router.get('/player/:playerId', paymentController.getPaymentsByPlayer);

// Get payments by branch
router.get('/branch/:branchId',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  paymentController.getPaymentsByBranch
);

// Process refund
router.post('/:id/refund',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.processRefund
);

// Mark payment as completed
router.patch('/:id/complete',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  paymentController.markAsCompleted
);

// Cancel payment
router.patch('/:id/cancel',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT),
  paymentController.cancelPayment
);

// Get pending payments
router.get('/status/pending',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN),
  paymentController.getPendingPayments
);

// Generate invoice
router.get('/:id/invoice', paymentController.generateInvoice);

module.exports = router;

