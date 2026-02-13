const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for receipt uploads
const uploadsDir = path.join(__dirname, '../../uploads/receipts');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpeg, jpg, png) and PDF files are allowed'));
  }
});

// All routes require authentication
router.use(authenticate);

// Routes for accountants and admins
router.get('/', authorize('accountant', 'admin'), expenseController.getExpenses);
router.get('/stats', authorize('accountant', 'admin'), expenseController.getExpenseStats);
router.get('/:id', authorize('accountant', 'admin'), expenseController.getExpenseById);
router.post('/', authorize('accountant', 'admin'), upload.single('receipt'), expenseController.createExpense);
router.put('/:id', authorize('accountant', 'admin'), upload.single('receipt'), expenseController.updateExpense);
router.delete('/:id', authorize('accountant', 'admin'), expenseController.deleteExpense);

module.exports = router;
