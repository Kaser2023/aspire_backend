const fs = require('fs/promises');
const path = require('path');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'products.json');

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: { en: 'Sport Bottle', ar: 'زجاجة رياضية' },
    description: {
      en: 'Premium quality water bottle with ASPIRE Academy logo',
      ar: 'زجاجة مياه عالية الجودة بشعار أكاديمية أسباير'
    },
    price: 35,
    badge: { en: 'New', ar: 'جديد', color: 'bg-primary' },
    image_url: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    name: { en: 'Official Jersey', ar: 'القميص الرسمي' },
    description: {
      en: 'Professional training jersey with academy design',
      ar: 'قميص تدريب احترافي بتصميم الأكاديمية'
    },
    price: 100,
    badge: { en: 'Best Seller', ar: 'الأكثر مبيعاً', color: 'bg-green-500' },
    image_url: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const ensureStorage = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2), 'utf8');
  }
};

const readProducts = async () => {
  await ensureStorage();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const writeProducts = async (products) => {
  await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2), 'utf8');
};

const findProductIndexById = (products, id) => (
  products.findIndex((product) => Number(product.id) === Number(id))
);

/**
 * @desc    List active store products
 * @route   GET /api/products
 * @access  Public
 */
exports.getProducts = asyncHandler(async (req, res) => {
  const products = await readProducts();
  const activeProducts = products.filter((product) => product.is_active !== false);

  res.json({
    success: true,
    data: activeProducts
  });
});

/**
 * @desc    List all store products for admin
 * @route   GET /api/products/admin
 * @access  Private (super_admin, owner)
 */
exports.getAllProductsAdmin = asyncHandler(async (req, res) => {
  const products = await readProducts();

  res.json({
    success: true,
    data: products
  });
});

/**
 * @desc    Create a store product
 * @route   POST /api/products
 * @access  Private (super_admin, owner)
 */
exports.createProduct = asyncHandler(async (req, res) => {
  const {
    name_en,
    name_ar,
    description_en,
    description_ar,
    badge_en,
    badge_ar,
    badge_color,
    image_url
  } = req.body;

  const price = Number(req.body.price);

  if (!name_en || !name_ar) {
    throw new AppError('Product name in English and Arabic is required', 400);
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new AppError('Price must be a valid number greater than 0', 400);
  }

  const products = await readProducts();
  const nextId = products.length > 0
    ? Math.max(...products.map((product) => Number(product.id) || 0)) + 1
    : 1;

  const now = new Date().toISOString();
  const uploadedImageUrl = req.file ? `/uploads/store-products/${req.file.filename}` : null;

  const product = {
    id: nextId,
    name: {
      en: String(name_en).trim(),
      ar: String(name_ar).trim()
    },
    description: {
      en: String(description_en || '').trim(),
      ar: String(description_ar || '').trim()
    },
    price,
    badge: {
      en: String(badge_en || 'New').trim(),
      ar: String(badge_ar || 'جديد').trim(),
      color: String(badge_color || 'bg-primary').trim()
    },
    image_url: uploadedImageUrl || String(image_url || '').trim() || null,
    is_active: true,
    created_by: req.user.id,
    created_at: now,
    updated_at: now
  };

  products.unshift(product);
  await writeProducts(products);

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: product
  });
});

/**
 * @desc    Update a store product
 * @route   PATCH /api/products/:id
 * @access  Private (super_admin, owner)
 */
exports.updateProduct = asyncHandler(async (req, res) => {
  const products = await readProducts();
  const productIndex = findProductIndexById(products, req.params.id);

  if (productIndex === -1) {
    throw new AppError('Product not found', 404);
  }

  const existing = products[productIndex];
  const priceProvided = req.body.price !== undefined && req.body.price !== null && req.body.price !== '';
  const parsedPrice = priceProvided ? Number(req.body.price) : Number(existing.price);

  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new AppError('Price must be a valid number greater than 0', 400);
  }

  const uploadedImageUrl = req.file ? `/uploads/store-products/${req.file.filename}` : null;

  const updatedProduct = {
    ...existing,
    name: {
      en: String(req.body.name_en ?? existing.name?.en ?? '').trim(),
      ar: String(req.body.name_ar ?? existing.name?.ar ?? '').trim()
    },
    description: {
      en: String(req.body.description_en ?? existing.description?.en ?? '').trim(),
      ar: String(req.body.description_ar ?? existing.description?.ar ?? '').trim()
    },
    price: parsedPrice,
    badge: {
      en: String(req.body.badge_en ?? existing.badge?.en ?? 'New').trim(),
      ar: String(req.body.badge_ar ?? existing.badge?.ar ?? 'جديد').trim(),
      color: String(req.body.badge_color ?? existing.badge?.color ?? 'bg-primary').trim()
    },
    image_url: uploadedImageUrl || String(req.body.image_url || '').trim() || existing.image_url || null,
    updated_at: new Date().toISOString()
  };

  if (!updatedProduct.name.en || !updatedProduct.name.ar) {
    throw new AppError('Product name in English and Arabic is required', 400);
  }

  products[productIndex] = updatedProduct;
  await writeProducts(products);

  res.json({
    success: true,
    message: 'Product updated successfully',
    data: updatedProduct
  });
});

/**
 * @desc    Toggle product active status
 * @route   PATCH /api/products/:id/toggle-status
 * @access  Private (super_admin, owner)
 */
exports.toggleProductStatus = asyncHandler(async (req, res) => {
  const products = await readProducts();
  const productIndex = findProductIndexById(products, req.params.id);

  if (productIndex === -1) {
    throw new AppError('Product not found', 404);
  }

  const updatedProduct = {
    ...products[productIndex],
    is_active: products[productIndex].is_active === false,
    updated_at: new Date().toISOString()
  };

  products[productIndex] = updatedProduct;
  await writeProducts(products);

  res.json({
    success: true,
    message: updatedProduct.is_active ? 'Product activated successfully' : 'Product deactivated successfully',
    data: updatedProduct
  });
});

/**
 * @desc    Delete product
 * @route   DELETE /api/products/:id
 * @access  Private (super_admin, owner)
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
  const products = await readProducts();
  const productIndex = findProductIndexById(products, req.params.id);

  if (productIndex === -1) {
    throw new AppError('Product not found', 404);
  }

  const [deletedProduct] = products.splice(productIndex, 1);
  await writeProducts(products);

  res.json({
    success: true,
    message: 'Product deleted successfully',
    data: deletedProduct
  });
});
