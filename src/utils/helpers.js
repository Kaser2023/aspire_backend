const crypto = require('crypto');

/**
 * Generate a random token
 * @param {number} length - Token length in bytes
 * @returns {string} Hex token
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a random numeric OTP
 * @param {number} length - OTP length
 * @returns {string} Numeric OTP
 */
const generateOTP = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
};

/**
 * Paginate query results
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Items per page
 * @returns {object} Pagination object with offset and limit
 */
const paginate = (page = 1, limit = 10) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  return {
    offset,
    limit: limitNum,
    page: pageNum
  };
};

/**
 * Format pagination response
 * @param {object} data - Sequelize findAndCountAll result
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object} Formatted pagination response
 */
const formatPaginationResponse = (data, page, limit) => {
  const totalPages = Math.ceil(data.count / limit);
  
  return {
    data: data.rows,
    pagination: {
      total: data.count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Format phone number to international format
 * @param {string} phone - Phone number
 * @param {string} countryCode - Country code (default: +966 for Saudi Arabia)
 * @returns {string} Formatted phone number
 */
const formatPhoneNumber = (phone, countryCode = '+966') => {
  const rawPhone = String(phone || '').trim();
  const targetCountryCode = String(countryCode || '+966').replace(/\D/g, '') || '966';

  if (!rawPhone) {
    return `+${targetCountryCode}`;
  }

  // Keep digits only for normalization.
  let digits = rawPhone.replace(/\D/g, '');

  // Convert "00" international prefix to regular international digits.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // If input already contains the selected country code (e.g. +96605xxxxxxx),
  // remove trunk zeros after the country code to normalize to E.164 style.
  if (digits.startsWith(targetCountryCode)) {
    const nationalNumber = digits.slice(targetCountryCode.length).replace(/^0+/, '');
    return `+${targetCountryCode}${nationalNumber}`;
  }

  // For local numbers (e.g. 05xxxxxxx), remove trunk zeros then add country code.
  const nationalNumber = digits.replace(/^0+/, '');
  return `+${targetCountryCode}${nationalNumber}`;
};

/**
 * Calculate age from date of birth
 * @param {Date|string} dateOfBirth - Date of birth
 * @returns {number} Age in years
 */
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Sanitize object - remove undefined and null values
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized object
 */
const sanitizeObject = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined && value !== null)
  );
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Format currency
 * @param {number} amount - Amount
 * @param {string} currency - Currency code
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, currency = 'SAR') => {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency
  }).format(amount);
};

/**
 * Generate a unique code
 * @param {string} prefix - Code prefix
 * @param {number} length - Random part length
 * @returns {string} Unique code
 */
const generateCode = (prefix = '', length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

module.exports = {
  generateToken,
  generateOTP,
  paginate,
  formatPaginationResponse,
  formatPhoneNumber,
  calculateAge,
  sanitizeObject,
  sleep,
  formatCurrency,
  generateCode
};

