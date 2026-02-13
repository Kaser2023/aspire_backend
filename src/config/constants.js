// User Roles
const ROLES = {
  PARENT: 'parent',
  COACH: 'coach',
  BRANCH_ADMIN: 'branch_admin',
  ACCOUNTANT: 'accountant',
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner'
};

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  [ROLES.PARENT]: 1,
  [ROLES.COACH]: 2,
  [ROLES.BRANCH_ADMIN]: 3,
  [ROLES.ACCOUNTANT]: 3,
  [ROLES.SUPER_ADMIN]: 4,
  [ROLES.OWNER]: 5
};

// Payment Status
const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled'
};

// Payment Methods
const PAYMENT_METHODS = {
  CASH: 'cash',
  CREDIT_CARD: 'credit_card',
  BANK_TRANSFER: 'bank_transfer',
  MADA: 'mada',
  APPLE_PAY: 'apple_pay',
  STC_PAY: 'stc_pay'
};

// Subscription Status
const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  PENDING: 'pending'
};

// Attendance Status
const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  LEAVE: 'leave'
};

// Player Status
const PLAYER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  GRADUATED: 'graduated'
};

// Program Types
const PROGRAM_TYPES = {
  TRAINING: 'training',
  COMPETITION: 'competition',
  CAMP: 'camp',
  PRIVATE: 'private'
};

// SMS Status
const SMS_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed'
};

// Announcement Types
const ANNOUNCEMENT_TYPES = {
  GENERAL: 'general',
  URGENT: 'urgent',
  EVENT: 'event',
  MAINTENANCE: 'maintenance'
};

// File Upload Limits
const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOC_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  SUBSCRIPTION_STATUS,
  ATTENDANCE_STATUS,
  PLAYER_STATUS,
  PROGRAM_TYPES,
  SMS_STATUS,
  ANNOUNCEMENT_TYPES,
  UPLOAD_LIMITS
};

