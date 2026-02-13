const { Announcement, User, Branch, Program, sequelize } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');
const { emitAnnouncementCreated } = require('../socket');

const normalizeAudience = (audience) => {
  if (!audience) return { type: 'all' };
  if (typeof audience === 'string') return { type: 'legacy', value: audience };
  if (typeof audience === 'object') return audience;
  return { type: 'all' };
};

const matchesLegacyAudience = (legacyValue, role) => {
  if (legacyValue === 'all') return true;
  if (legacyValue === 'staff') {
    return [ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT, ROLES.COACH].includes(role);
  }
  if (legacyValue === 'branch_admin') return role === ROLES.BRANCH_ADMIN;
  if (legacyValue === 'coaches') return role === ROLES.COACH;
  if (legacyValue === 'parents') return role === ROLES.PARENT;
  return legacyValue === role;
};

const matchesAudience = (announcement, user) => {
  const audience = normalizeAudience(announcement.target_audience);

  if (audience.type === 'legacy') {
    return matchesLegacyAudience(audience.value, user.role);
  }

  if (audience.type === 'all') return true;

  if (audience.type === 'roles') {
    return (audience.roles || []).includes(user.role);
  }

  if (audience.type === 'specific') {
    if (audience.users?.includes(user.id)) return true;
    if (user.branch_id && audience.branches?.[user.branch_id]) {
      const branchData = audience.branches[user.branch_id] || {};
      if ((branchData.roles || []).includes(user.role)) return true;
      if ((branchData.users || []).includes(user.id)) return true;
    }
  }

  return false;
};

/**
 * @desc    Get all announcements
 * @route   GET /api/announcements
 * @access  Private
 */
exports.getAllAnnouncements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, type, is_published, target_audience } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (type) where.type = type;
  if (is_published !== undefined) where.is_published = is_published === 'true';
  if (target_audience) where.target_audience = target_audience;

  // Role-based filtering for admin views
  console.log('📢 Announcements filter - User role:', req.user.role, 'Branch ID:', req.user.branch_id);
  if (req.user.role === ROLES.BRANCH_ADMIN && req.user.branch_id) {
    // Only show announcements created for this specific branch
    where.target_branch_id = req.user.branch_id;
    console.log('📢 Filtering for BRANCH_ADMIN - target_branch_id:', req.user.branch_id);
  } else if (req.user.role === ROLES.SUPER_ADMIN) {
    // Super Admin sees all non-branch announcements, excluding accountant-created ones
    where.target_branch_id = null;
    where.author_id = {
      [Op.notIn]: sequelize.literal(`(SELECT id FROM users WHERE role = '${ROLES.ACCOUNTANT}')`)
    };
    console.log('📢 Filtering for SUPER_ADMIN - excluding accountant announcements');
  }
  console.log('📢 Final where clause:', JSON.stringify(where));

  const announcements = await Announcement.findAndCountAll({
    where,
    include: [
      { association: 'author', attributes: ['id', 'first_name', 'last_name', 'role'] },
      { association: 'target_branch', attributes: ['id', 'name'] }
    ],
    offset,
    limit: limitNum,
    order: [['is_pinned', 'DESC'], ['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(announcements, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get announcements feed for users
 * @route   GET /api/announcements/feed
 * @access  Private
 */
exports.getAnnouncementsFeed = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {
    is_published: true,
    [Op.or]: [
      { expires_at: null },
      { expires_at: { [Op.gt]: new Date() } }
    ]
  };

  const announcements = await Announcement.findAll({
    where,
    include: [
      { association: 'author', attributes: ['id', 'first_name', 'last_name', 'avatar'] },
      { association: 'target_branch', attributes: ['id', 'name'] }
    ],
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const filteredAnnouncements = announcements.filter((announcement) => {
    if (!matchesAudience(announcement, req.user)) return false;
    if (!announcement.target_branch_id) return true;
    return announcement.target_branch_id === req.user.branch_id;
  });

  res.json({
    success: true,
    data: filteredAnnouncements
  });
});

/**
 * @desc    Get announcement by ID
 * @route   GET /api/announcements/:id
 * @access  Private
 */
exports.getAnnouncementById = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id, {
    include: [
      { association: 'author', attributes: ['id', 'first_name', 'last_name', 'avatar', 'role'] },
      { association: 'target_branch' },
      { association: 'target_program' }
    ]
  });

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  res.json({
    success: true,
    data: announcement
  });
});

/**
 * @desc    Create new announcement
 * @route   POST /api/announcements
 * @access  Private/Admin
 */
exports.createAnnouncement = asyncHandler(async (req, res) => {
  const {
    title, title_ar, content, content_ar, type, priority,
    target_audience, target_branch_id, target_program_id,
    expires_at, is_pinned, send_notification, send_sms, is_published
  } = req.body;

  // Branch admins can only create announcements for their branch
  let branchId = target_branch_id;
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    branchId = req.user.branch_id;
  }

  const announcement = await Announcement.create({
    title,
    title_ar,
    content,
    content_ar,
    type: type || 'general',
    priority: priority || 'medium',
    author_id: req.user.id,
    target_audience: target_audience || 'all',
    target_branch_id: branchId,
    target_program_id,
    expires_at,
    is_pinned: is_pinned || false,
    send_notification: send_notification !== false,
    send_sms: send_sms || false,
    is_published: is_published === true,
    published_at: is_published === true ? new Date() : null
  });

  if (announcement.is_published) {
    const hydratedAnnouncement = await Announcement.findByPk(announcement.id, {
      include: [
        { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
        { association: 'target_branch', attributes: ['id', 'name'] }
      ]
    });
    emitAnnouncementCreated(hydratedAnnouncement, hydratedAnnouncement.target_audience);
  }

  res.status(201).json({
    success: true,
    message: 'Announcement created successfully',
    data: announcement
  });
});

/**
 * @desc    Update announcement
 * @route   PUT /api/announcements/:id
 * @access  Private/Admin
 */
exports.updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  // Check permission
  if (req.user.role === ROLES.BRANCH_ADMIN && announcement.author_id !== req.user.id) {
    throw new AppError('Not authorized to update this announcement', 403);
  }

  await announcement.update(req.body);

  res.json({
    success: true,
    message: 'Announcement updated successfully',
    data: announcement
  });
});

/**
 * @desc    Delete announcement
 * @route   DELETE /api/announcements/:id
 * @access  Private/Admin
 */
exports.deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  // Check permission
  if (req.user.role === ROLES.BRANCH_ADMIN && announcement.author_id !== req.user.id) {
    throw new AppError('Not authorized to delete this announcement', 403);
  }

  await announcement.destroy();

  res.json({
    success: true,
    message: 'Announcement deleted successfully'
  });
});

/**
 * @desc    Upload announcement image
 * @route   POST /api/announcements/:id/image
 * @access  Private/Admin
 */
exports.uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Please upload an image file', 400);
  }

  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  const imageUrl = `/uploads/announcements/${req.file.filename}`;
  await announcement.update({ image: imageUrl });

  res.json({
    success: true,
    message: 'Image uploaded successfully',
    data: { image: imageUrl }
  });
});

/**
 * @desc    Publish announcement
 * @route   PATCH /api/announcements/:id/publish
 * @access  Private/Admin
 */
exports.publishAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  await announcement.update({
    is_published: true,
    published_at: new Date()
  });

  const hydratedAnnouncement = await Announcement.findByPk(announcement.id, {
    include: [
      { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
      { association: 'target_branch', attributes: ['id', 'name'] }
    ]
  });
  emitAnnouncementCreated(hydratedAnnouncement, hydratedAnnouncement.target_audience);

  // TODO: Send notifications if enabled
  // if (announcement.send_notification) { ... }
  // if (announcement.send_sms) { ... }

  res.json({
    success: true,
    message: 'Announcement published successfully',
    data: announcement
  });
});

/**
 * @desc    Unpublish announcement
 * @route   PATCH /api/announcements/:id/unpublish
 * @access  Private/Admin
 */
exports.unpublishAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  await announcement.update({ is_published: false });

  res.json({
    success: true,
    message: 'Announcement unpublished successfully',
    data: announcement
  });
});

/**
 * @desc    Toggle pin status
 * @route   PATCH /api/announcements/:id/pin
 * @access  Private/Admin
 */
exports.togglePinStatus = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  await announcement.update({ is_pinned: !announcement.is_pinned });

  res.json({
    success: true,
    message: `Announcement ${announcement.is_pinned ? 'pinned' : 'unpinned'} successfully`,
    data: { is_pinned: announcement.is_pinned }
  });
});

/**
 * @desc    Increment view count
 * @route   POST /api/announcements/:id/view
 * @access  Private
 */
exports.incrementViewCount = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  await announcement.increment('views_count');

  res.json({
    success: true,
    data: { views_count: announcement.views_count + 1 }
  });
});

