const { AuditLog } = require('../models');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');

const ALLOWED_MODULES = ['payments', 'discounts', 'expenses', 'attendance', 'accountant_auto_announcements'];

const canReadAuditLogs = (role) => {
  return [ROLES.ACCOUNTANT, ROLES.BRANCH_ADMIN, ROLES.SUPER_ADMIN, ROLES.OWNER].includes(role);
};

exports.getEntityHistory = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  const { page = 1, limit = 25 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  if (!canReadAuditLogs(req.user.role)) {
    throw new AppError('Not authorized to view audit logs', 403);
  }

  const logs = await AuditLog.findAndCountAll({
    where: { entity_type: entityType, entity_id: entityId },
    include: [{ association: 'actor', attributes: ['id', 'first_name', 'last_name', 'role'] }],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(logs, page, limit);
  res.json({ success: true, ...response });
});

exports.getModuleHistory = asyncHandler(async (req, res) => {
  const { module } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  if (!canReadAuditLogs(req.user.role)) {
    throw new AppError('Not authorized to view audit logs', 403);
  }

  if (!ALLOWED_MODULES.includes(module)) {
    throw new AppError('Unsupported audit module', 400);
  }

  const logs = await AuditLog.findAndCountAll({
    where: { module },
    include: [{ association: 'actor', attributes: ['id', 'first_name', 'last_name', 'role'] }],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(logs, page, limit);
  res.json({ success: true, ...response });
});
