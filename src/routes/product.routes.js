const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const productController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads/store-products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname || '');
    cb(null, `product-${timestamp}-${random}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Public
router.get('/', productController.getProducts);

// Protected: Super admin/owner can manage products
router.get(
  '/admin',
  authenticate,
  authorize('super_admin', 'owner'),
  productController.getAllProductsAdmin
);

router.post(
  '/',
  authenticate,
  authorize('super_admin', 'owner'),
  upload.single('image'),
  productController.createProduct
);

router.patch(
  '/:id',
  authenticate,
  authorize('super_admin', 'owner'),
  upload.single('image'),
  productController.updateProduct
);

router.patch(
  '/:id/toggle-status',
  authenticate,
  authorize('super_admin', 'owner'),
  productController.toggleProductStatus
);

router.delete(
  '/:id',
  authenticate,
  authorize('super_admin', 'owner'),
  productController.deleteProduct
);

module.exports = router;
