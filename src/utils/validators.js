const { body, param, query } = require('express-validator');
const { normalizeArabicNumerals } = require('./helpers');

/**
 * Custom sanitizer: converts Eastern Arabic / Extended Arabic-Indic numerals
 * (٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹) to Western Arabic numerals (0-9) so that
 * all downstream regex patterns and validators work correctly.
 */
const normalizeNumerals = (value) =>
  typeof value === 'string' ? normalizeArabicNumerals(value) : value;

// Common validation rules
const commonValidators = {
  uuid: (field, location = 'param') => {
    const validator = location === 'param' ? param(field) : 
                      location === 'body' ? body(field) : query(field);
    return validator
      .isUUID(4)
      .withMessage(`${field} must be a valid UUID`);
  },

  email: body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  password: body('password')
    .customSanitizer(normalizeNumerals)
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  phone: body('phone')
    .optional()
    .trim()
    .customSanitizer(normalizeNumerals)
    .matches(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/)
    .withMessage('Please provide a valid phone number'),

  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Limit must be between 1 and 500')
  ]
};

// Auth validators
const authValidators = {
  register: [
    commonValidators.email,
    commonValidators.password,
    body('first_name')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 100 })
      .withMessage('First name cannot exceed 100 characters'),
    body('last_name')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ max: 100 })
      .withMessage('Last name cannot exceed 100 characters'),
    commonValidators.phone,
    body('role')
      .optional()
      .isIn(['parent', 'coach', 'branch_admin', 'accountant', 'super_admin', 'owner'])
      .withMessage('Invalid role')
  ],

  login: [
    body('phone')
      .trim()
      .customSanitizer(normalizeNumerals)
      .notEmpty()
      .withMessage('Phone number is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  forgotPassword: [
    commonValidators.email
  ],

  resetPassword: [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required'),
    commonValidators.password
  ],

  changePassword: [
    body('current_password')
      .notEmpty()
      .withMessage('Current password is required'),
    body('new_password')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
  ]
};

// User validators (for admin-created users - simpler validation)
const userValidators = {
  create: [
    body('first_name')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 100 })
      .withMessage('First name cannot exceed 100 characters'),
    body('last_name')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Last name cannot exceed 100 characters'),
    body('phone')
      .trim()
      .customSanitizer(normalizeNumerals)
      .notEmpty()
      .withMessage('Phone number is required')
      .isLength({ min: 9, max: 15 })
      .withMessage('Phone number must be between 9 and 15 digits'),
    body('email')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('role')
      .optional()
      .isIn(['parent', 'coach', 'branch_admin', 'accountant', 'super_admin', 'owner'])
      .withMessage('Invalid role'),
    body('branch_id')
      .optional({ nullable: true, checkFalsy: true })
      .isUUID(4)
      .withMessage('Branch ID must be a valid UUID')
  ],

  update: [
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('first_name')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('First name cannot exceed 100 characters'),
    body('last_name')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Last name cannot exceed 100 characters'),
    commonValidators.phone
  ]
};

// Player validators
const playerValidators = {
  create: [
    body('first_name')
      .trim()
      .notEmpty()
      .withMessage('First name is required'),
    body('last_name')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Last name cannot exceed 100 characters'),
    body('date_of_birth')
      .notEmpty()
      .withMessage('Date of birth is required')
      .isDate()
      .withMessage('Invalid date format'),
    body('gender')
      .optional()
      .isIn(['male', 'female'])
      .withMessage('Gender must be male or female'),
    body('parent_id')
      .optional({ nullable: true, checkFalsy: true })
      .isUUID(4)
      .withMessage('Parent ID must be a valid UUID'),
    body('branch_id')
      .notEmpty()
      .withMessage('Branch is required')
      .isUUID(4)
      .withMessage('Branch ID must be a valid UUID'),
    body('program_id')
      .optional({ nullable: true, checkFalsy: true })
      .isUUID(4)
      .withMessage('Program ID must be a valid UUID'),
    body('nationality')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Nationality cannot exceed 100 characters'),
    body('address')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 255 })
      .withMessage('Address cannot exceed 255 characters')
  ],

  update: [
    body('first_name')
      .optional()
      .trim()
      .isLength({ max: 100 }),
    body('last_name')
      .optional()
      .trim()
      .isLength({ max: 100 }),
    body('date_of_birth')
      .optional()
      .isDate()
      .withMessage('Invalid date format'),
    body('nationality')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 100 }),
    body('address')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 255 }),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'suspended', 'graduated'])
      .withMessage('Invalid status')
  ]
};

// Branch validators
const branchValidators = {
  create: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Branch name is required'),
    body('code')
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage('Branch code cannot exceed 20 characters'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email address')
  ],

  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ max: 200 }),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email address')
  ]
};

// Program validators
const programValidators = {
  create: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Program name is required'),
    body('branch_id')
      .notEmpty()
      .withMessage('Branch is required')
      .isUUID(4)
      .withMessage('Branch ID must be a valid UUID'),
    body('price_monthly')
      .optional()
      .customSanitizer(normalizeNumerals)
      .isDecimal()
      .withMessage('Price must be a valid decimal number'),
    body('type')
      .optional()
      .isIn(['training', 'competition', 'camp', 'private'])
      .withMessage('Invalid program type'),
    body('pricing_plans')
      .optional()
      .isArray()
      .withMessage('Pricing plans must be an array'),
    body('pricing_plans.*.name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Plan name is required'),
    body('pricing_plans.*.price')
      .optional()
      .customSanitizer(normalizeNumerals)
      .isDecimal()
      .withMessage('Plan price must be a valid number'),
    body('pricing_plans.*.duration_months')
      .optional()
      .customSanitizer(normalizeNumerals)
      .isInt({ min: 1 })
      .withMessage('Duration must be at least 1 month')
  ],

  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ max: 200 }),
    body('price_monthly')
      .optional()
      .customSanitizer(normalizeNumerals)
      .isDecimal()
      .withMessage('Price must be a valid decimal number'),
    body('pricing_plans')
      .optional()
      .isArray()
      .withMessage('Pricing plans must be an array')
  ]
};

// Payment validators
const paymentValidators = {
  create: [
    body('player_id')
      .optional()
      .isUUID(4)
      .withMessage('Player ID must be a valid UUID'),
    body('subscription_id')
      .optional()
      .isUUID(4)
      .withMessage('Subscription ID must be a valid UUID'),
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .customSanitizer(normalizeNumerals)
      .isDecimal()
      .withMessage('Amount must be a valid decimal number'),
    body('payment_method')
      .optional()
      .isIn(['cash', 'credit_card', 'bank_transfer', 'mada', 'apple_pay', 'stc_pay'])
      .withMessage('Invalid payment method')
  ]
};

// Attendance validators
const attendanceValidators = {
  record: [
    body('player_id')
      .notEmpty()
      .withMessage('Player ID is required')
      .isUUID(4)
      .withMessage('Player ID must be a valid UUID'),
    body('program_id')
      .notEmpty()
      .withMessage('Program ID is required')
      .isUUID(4)
      .withMessage('Program ID must be a valid UUID'),
    body('session_date')
      .notEmpty()
      .withMessage('Session date is required')
      .isDate()
      .withMessage('Invalid date format'),
    body('status')
      .notEmpty()
      .withMessage('Attendance status is required')
      .isIn(['present', 'absent', 'late', 'leave'])
      .withMessage('Invalid attendance status')
  ],

  bulkRecord: [
    body('program_id')
      .notEmpty()
      .withMessage('Program ID is required')
      .isUUID(4)
      .withMessage('Program ID must be a valid UUID'),
    body('session_date')
      .notEmpty()
      .withMessage('Session date is required')
      .isDate()
      .withMessage('Invalid date format'),
    body('attendance')
      .isArray({ min: 1 })
      .withMessage('Attendance records are required'),
    body('attendance.*.player_id')
      .isUUID(4)
      .withMessage('Player ID must be a valid UUID'),
    body('attendance.*.status')
      .isIn(['present', 'absent', 'late', 'leave'])
      .withMessage('Invalid attendance status')
  ]
};

// SMS validators
const smsValidators = {
  send: [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ max: 1000 })
      .withMessage('Message cannot exceed 1000 characters'),
    body('recipient_type')
      .notEmpty()
      .withMessage('Recipient type is required')
      .custom((value) => {
        // Allow both string ENUM values and JSON audience object
        if (typeof value === 'object' && value !== null) {
          if (!['all', 'roles', 'specific'].includes(value.type)) {
            throw new Error('Invalid audience type');
          }
          return true;
        }
        if (typeof value === 'string' && ['individual', 'group', 'branch', 'program', 'all'].includes(value)) {
          return true;
        }
        throw new Error('Invalid recipient type');
      })
  ]
};

// Announcement validators
const announcementValidators = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required')
      .isLength({ max: 255 })
      .withMessage('Title cannot exceed 255 characters'),
    body('content')
      .trim()
      .notEmpty()
      .withMessage('Content is required'),
    body('type')
      .optional()
      .isIn(['general', 'urgent', 'event', 'maintenance'])
      .withMessage('Invalid announcement type'),
    body('target_audience')
      .optional()
      .custom((value) => {
        // Accept legacy ENUM values
        if (typeof value === 'string') {
          const validValues = ['all', 'parents', 'coaches', 'staff', 'branch'];
          if (!validValues.includes(value)) {
            throw new Error('Invalid target audience');
          }
          return true;
        }
        // Accept new JSON format from AudienceSelector
        if (typeof value === 'object' && value !== null) {
          const validTypes = ['all', 'roles', 'specific', 'branches', 'users', 'custom'];
          if (!value.type || !validTypes.includes(value.type)) {
            throw new Error('Invalid target audience type');
          }
          return true;
        }
        throw new Error('Invalid target audience format');
      })
  ],

  update: [
    body('title')
      .optional()
      .trim()
      .isLength({ max: 255 }),
    body('content')
      .optional()
      .trim()
  ]
};

module.exports = {
  commonValidators,
  authValidators,
  userValidators,
  playerValidators,
  branchValidators,
  programValidators,
  paymentValidators,
  attendanceValidators,
  smsValidators,
  announcementValidators
};

