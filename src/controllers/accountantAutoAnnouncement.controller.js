const { AccountantAutoAnnouncement, User } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { logAuditEvent, getLatestAuditMap } = require('../utils/auditLogger');

/**
 * @desc    Get all accountant auto announcements
 * @route   GET /api/accountant-auto-announcements
 * @access  Private/Accountant
 */
exports.getAll = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = { created_by: req.user.id };

  const announcements = await AccountantAutoAnnouncement.findAndCountAll({
    where,
    include: [{ association: 'creator', attributes: ['id', 'first_name', 'last_name', 'role'] }],
    offset,
    limit: limitNum,
    order: [['type', 'ASC'], ['created_at', 'DESC']]
  });

  const latestAuditMap = await getLatestAuditMap('accountant_auto_announcement', announcements.rows.map((a) => a.id));
  const plainAnnouncements = announcements.rows.map(a => {
    const item = a.get({ plain: true });
    const latestAudit = latestAuditMap[item.id];
    const actor = latestAudit?.actor;
    item.last_updated_by = actor
      ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
      : (item.creator || null);
    item.last_updated_at = latestAudit?.created_at || item.updated_at || item.created_at;
    return item;
  });

  const response = formatPaginationResponse(
    { ...announcements, rows: plainAnnouncements },
    page,
    limit
  );

  res.json({ success: true, ...response });
});

/**
 * @desc    Get accountant auto announcement by ID
 * @route   GET /api/accountant-auto-announcements/:id
 * @access  Private/Accountant
 */
exports.getById = asyncHandler(async (req, res) => {
  const announcement = await AccountantAutoAnnouncement.findOne({
    where: { id: req.params.id, created_by: req.user.id },
    include: [{ association: 'creator', attributes: ['id', 'first_name', 'last_name', 'role'] }]
  });

  if (!announcement) {
    throw new AppError('Auto announcement not found', 404);
  }

  const latestAuditMap = await getLatestAuditMap('accountant_auto_announcement', [announcement.id]);
  const latestAudit = latestAuditMap[announcement.id];
  const item = announcement.get({ plain: true });
  const actor = latestAudit?.actor;
  item.last_updated_by = actor
    ? { id: actor.id, first_name: actor.first_name, last_name: actor.last_name, role: actor.role }
    : (item.creator || null);
  item.last_updated_at = latestAudit?.created_at || item.updated_at || item.created_at;

  res.json({ success: true, data: item });
});

/**
 * @desc    Create accountant auto announcement
 * @route   POST /api/accountant-auto-announcements
 * @access  Private/Accountant
 */
exports.create = asyncHandler(async (req, res) => {
  const {
    title, type, enabled, trigger_mode,
    days_before, days_after, specific_date,
    message, send_time, target_audience
  } = req.body;

  if (!title || !type || !message) {
    throw new AppError('Please provide title, type, and message', 400);
  }

  // Sanitize specific_date: convert empty/invalid values to null
  const sanitizedSpecificDate = (specific_date && specific_date !== 'Invalid date' && !isNaN(new Date(specific_date).getTime()))
    ? specific_date
    : null;

  const announcement = await AccountantAutoAnnouncement.create({
    title,
    type,
    enabled: enabled !== false,
    trigger_mode: trigger_mode || 'days',
    days_before: days_before || 7,
    days_after: days_after || 3,
    specific_date: sanitizedSpecificDate,
    message,
    send_time: send_time || '09:00',
    target_audience: target_audience || null,
    created_by: req.user.id
  });

  await logAuditEvent({
    module: 'accountant_auto_announcements',
    entityType: 'accountant_auto_announcement',
    entityId: announcement.id,
    action: 'create',
    actor: req.user,
    before: null,
    after: announcement
  });

  const plain = announcement.get({ plain: true });
  plain.last_updated_by = {
    id: req.user.id,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    role: req.user.role
  };
  plain.last_updated_at = plain.updated_at || plain.created_at;

  res.status(201).json({
    success: true,
    message: 'Auto announcement created successfully',
    data: plain
  });
});

/**
 * @desc    Update accountant auto announcement
 * @route   PUT /api/accountant-auto-announcements/:id
 * @access  Private/Accountant
 */
exports.update = asyncHandler(async (req, res) => {
  const announcement = await AccountantAutoAnnouncement.findOne({
    where: { id: req.params.id, created_by: req.user.id }
  });

  if (!announcement) {
    throw new AppError('Auto announcement not found', 404);
  }

  const {
    title, type, enabled, trigger_mode,
    days_before, days_after, specific_date,
    message, send_time, target_audience
  } = req.body;

  // Sanitize specific_date: convert empty/invalid values to null
  const sanitizedSpecificDate = (specific_date && specific_date !== 'Invalid date' && !isNaN(new Date(specific_date).getTime()))
    ? specific_date
    : null;

  const beforeData = announcement.get({ plain: true });
  await announcement.update({
    title, type, enabled, trigger_mode,
    days_before, days_after,
    specific_date: sanitizedSpecificDate,
    message, send_time, target_audience
  });

  await logAuditEvent({
    module: 'accountant_auto_announcements',
    entityType: 'accountant_auto_announcement',
    entityId: announcement.id,
    action: 'update',
    actor: req.user,
    before: beforeData,
    after: announcement
  });

  const plain = announcement.get({ plain: true });
  plain.last_updated_by = {
    id: req.user.id,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    role: req.user.role
  };
  plain.last_updated_at = plain.updated_at || new Date().toISOString();

  res.json({
    success: true,
    message: 'Auto announcement updated successfully',
    data: plain
  });
});

/**
 * @desc    Delete accountant auto announcement
 * @route   DELETE /api/accountant-auto-announcements/:id
 * @access  Private/Accountant
 */
exports.remove = asyncHandler(async (req, res) => {
  const announcement = await AccountantAutoAnnouncement.findOne({
    where: { id: req.params.id, created_by: req.user.id }
  });

  if (!announcement) {
    throw new AppError('Auto announcement not found', 404);
  }

  const beforeData = announcement.get({ plain: true });
  await announcement.destroy();

  await logAuditEvent({
    module: 'accountant_auto_announcements',
    entityType: 'accountant_auto_announcement',
    entityId: req.params.id,
    action: 'delete',
    actor: req.user,
    before: beforeData,
    after: null
  });

  res.json({ success: true, message: 'Auto announcement deleted successfully' });
});

/**
 * @desc    Toggle accountant auto announcement enabled status
 * @route   PATCH /api/accountant-auto-announcements/:id/toggle
 * @access  Private/Accountant
 */
exports.toggle = asyncHandler(async (req, res) => {
  const announcement = await AccountantAutoAnnouncement.findOne({
    where: { id: req.params.id, created_by: req.user.id }
  });

  if (!announcement) {
    throw new AppError('Auto announcement not found', 404);
  }

  const beforeData = announcement.get({ plain: true });
  await announcement.update({ enabled: !announcement.enabled });

  await logAuditEvent({
    module: 'accountant_auto_announcements',
    entityType: 'accountant_auto_announcement',
    entityId: announcement.id,
    action: 'toggle',
    actor: req.user,
    before: beforeData,
    after: announcement
  });

  const plain = announcement.get({ plain: true });
  plain.last_updated_by = {
    id: req.user.id,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    role: req.user.role
  };
  plain.last_updated_at = plain.updated_at || new Date().toISOString();

  res.json({
    success: true,
    message: `Auto announcement ${announcement.enabled ? 'enabled' : 'disabled'} successfully`,
    data: plain
  });
});
