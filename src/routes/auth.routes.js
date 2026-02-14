const express = require('express');
const multer = require('multer');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authValidators } = require('../utils/validators');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
    }
  }
});

// Public routes - Email/Password auth
router.post('/register', authValidators.register, validate, authController.register);
router.post('/signup', upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'id_document', maxCount: 1 }
]), authController.signup); // Direct signup without OTP
router.post('/login', authValidators.login, validate, authController.login);
router.post('/forgot-password', authValidators.forgotPassword, validate, authController.forgotPassword);
router.post('/reset-password', authValidators.resetPassword, validate, authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);

// OTP Authentication routes (for parents)
router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/complete-registration', authController.completeOTPRegistration);

// Admin registration routes
router.get('/setup-status', authController.checkSetupStatus);
router.post('/verify-setup-key', authController.verifySetupKey);
router.post('/register-admin', authController.registerAdmin);
router.post('/reset-admin-password', authController.resetAdminPasswordWithSetupKey);

// Protected routes
router.use(authenticate);
router.get('/me', authController.getMe);
router.put('/me', authController.updateMe);
router.post('/change-password', authValidators.changePassword, validate, authController.changePassword);
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);

module.exports = router;

