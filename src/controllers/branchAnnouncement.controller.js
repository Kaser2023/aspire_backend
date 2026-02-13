const { BranchAnnouncement, User, Branch, Announcement } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { emitAnnouncementCreated } = require('../socket');

/**
 * @desc    Get all branch announcements for the current branch
 * @route   GET /api/branch-announcements
 * @access  Private/BranchAdmin
 */
exports.getAllBranchAnnouncements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  // Only get announcements for the user's branch
  const where = {
    branch_id: req.user.branch_id
  };

  const announcements = await BranchAnnouncement.findAndCountAll({
    where,
    include: [
      { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
      { association: 'branch', attributes: ['id', 'name', 'name_ar'] }
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
 * @desc    Get branch announcement by ID
 * @route   GET /api/branch-announcements/:id
 * @access  Private/BranchAdmin
 */
exports.getBranchAnnouncementById = asyncHandler(async (req, res) => {
  const announcement = await BranchAnnouncement.findOne({
    where: {
      id: req.params.id,
      branch_id: req.user.branch_id
    },
    include: [
      { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
      { association: 'branch', attributes: ['id', 'name', 'name_ar'] }
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
 * @desc    Create new branch announcement
 * @route   POST /api/branch-announcements
 * @access  Private/BranchAdmin
 */
exports.createBranchAnnouncement = asyncHandler(async (req, res) => {
  console.log('📥 Request body:', req.body);
  console.log('👤 User:', { id: req.user.id, branch_id: req.user.branch_id, role: req.user.role });
  
  const { title, title_ar, content, content_ar, target_audience, is_pinned, expires_at } = req.body;

  if (!req.user.branch_id) {
    throw new AppError('Branch ID is required', 400);
  }

  // Validate required fields
  if (!title || !content) {
    throw new AppError('Title and content are required', 400);
  }

  // Convert target_audience to a short identifier for VARCHAR(50)
  let audienceValue = 'all';
  let specificUsers = null;
  let customRoles = null;
  
  console.log('🎯 Original target_audience:', target_audience, typeof target_audience);
  
  // Parse JSON string if needed
  let parsedAudience = target_audience;
  if (typeof target_audience === 'string' && target_audience.startsWith('{')) {
    try {
      parsedAudience = JSON.parse(target_audience);
    } catch (e) {
      console.log('❌ Failed to parse target_audience JSON:', e.message);
      parsedAudience = target_audience;
    }
  }
  
  if (parsedAudience && typeof parsedAudience === 'object') {
    if (parsedAudience.type === 'roles' && Array.isArray(parsedAudience.roles)) {
      const roles = parsedAudience.roles;
      if (roles.length === 1) {
        if (roles[0] === 'parent') audienceValue = 'parents';
        else if (roles[0] === 'coach') audienceValue = 'coaches';
        else if (roles[0] === 'player') audienceValue = 'players';
      } else if (roles.length === 3) {
        audienceValue = 'all';
      } else {
        audienceValue = 'custom';
        customRoles = roles;
      }
    } else if (parsedAudience.type === 'users' && Array.isArray(parsedAudience.users)) {
      audienceValue = 'specific_users';
      specificUsers = parsedAudience.users;
    }
  } else if (typeof parsedAudience === 'string') {
    // Legacy string values
    audienceValue = parsedAudience;
  }

  console.log('📢 Creating branch announcement:', { title, target_audience: audienceValue, specificUsers, customRoles, branch_id: req.user.branch_id });

  const announcementData = {
    branch_id: req.user.branch_id,
    title,
    title_ar: title_ar || null,
    content,
    content_ar: content_ar || null,
    target_audience: audienceValue,
    author_id: req.user.id,
    is_published: true,
    is_pinned: is_pinned || false,
    expires_at: expires_at || null
  };

  console.log('📊 Announcement data for create:', announcementData);

  const announcement = await BranchAnnouncement.create(announcementData);

  const normalizeAudience = (audience, users, roles) => {
    if (audience === 'specific_users' && users) {
      return { type: 'specific', users: users };
    }
    if (audience === 'custom' && roles && roles.length > 0) {
      return { type: 'roles', roles: roles };
    }
    if (!audience) return { type: 'roles', roles: ['parent', 'coach', 'player'] };
    if (typeof audience === 'object') return audience;
    if (typeof audience === 'string') {
      if (audience === 'parents') return { type: 'roles', roles: ['parent'] };
      if (audience === 'coaches') return { type: 'roles', roles: ['coach'] };
      if (audience === 'players') return { type: 'roles', roles: ['player'] };
      return { type: 'roles', roles: ['parent', 'coach', 'player'] };
    }
    return { type: 'roles', roles: ['parent', 'coach', 'player'] };
  };

  // Also create a global Announcement for notifications (non-blocking)
  try {
    const announcementAudience = normalizeAudience(audienceValue, specificUsers, customRoles);
    const createdAnnouncement = await Announcement.create({
      title,
      title_ar,
      content,
      content_ar,
      type: 'general',
      priority: 'medium',
      author_id: req.user.id,
      target_audience: announcementAudience,
      target_branch_id: req.user.branch_id,
      is_published: true,
      published_at: new Date(),
      is_pinned: is_pinned || false,
      send_notification: true,
      send_sms: false,
      expires_at
    });

    const hydratedAnnouncement = await Announcement.findByPk(createdAnnouncement.id, {
      include: [
        { association: 'author', attributes: ['id', 'first_name', 'last_name'] },
        { association: 'target_branch', attributes: ['id', 'name'] }
      ]
    });
    emitAnnouncementCreated(hydratedAnnouncement, hydratedAnnouncement.target_audience);
  } catch (globalErr) {
    console.error('Error creating global announcement (branch announcement was saved):', globalErr.message);
  }

  res.status(201).json({
    success: true,
    message: 'Announcement created successfully',
    data: announcement
  });
});

/**
 * @desc    Update branch announcement
 * @route   PUT /api/branch-announcements/:id
 * @access  Private/BranchAdmin
 */
exports.updateBranchAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await BranchAnnouncement.findOne({
    where: {
      id: req.params.id,
      branch_id: req.user.branch_id
    }
  });

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  const { title, title_ar, content, content_ar, target_audience, is_published, is_pinned, expires_at } = req.body;

  // Parse target_audience if it's a JSON string (from frontend multi-role or specific-users selection)
  let audienceValue = target_audience;
  if (target_audience !== undefined) {
    let parsedAudience = target_audience;
    if (typeof target_audience === 'string' && target_audience.startsWith('{')) {
      try {
        parsedAudience = JSON.parse(target_audience);
      } catch (e) {
        parsedAudience = target_audience;
      }
    }
    if (parsedAudience && typeof parsedAudience === 'object') {
      if (parsedAudience.type === 'roles' && Array.isArray(parsedAudience.roles)) {
        const roles = parsedAudience.roles;
        if (roles.length === 1) {
          if (roles[0] === 'parent') audienceValue = 'parents';
          else if (roles[0] === 'coach') audienceValue = 'coaches';
          else if (roles[0] === 'player') audienceValue = 'players';
        } else if (roles.length === 3) {
          audienceValue = 'all';
        } else {
          audienceValue = 'custom';
        }
      } else if (parsedAudience.type === 'users' && Array.isArray(parsedAudience.users)) {
        audienceValue = 'specific_users';
      }
    }
  }

  await announcement.update({
    title: title !== undefined ? title : announcement.title,
    title_ar: title_ar !== undefined ? title_ar : announcement.title_ar,
    content: content !== undefined ? content : announcement.content,
    content_ar: content_ar !== undefined ? content_ar : announcement.content_ar,
    target_audience: audienceValue !== undefined ? audienceValue : announcement.target_audience,
    is_published: is_published !== undefined ? is_published : announcement.is_published,
    is_pinned: is_pinned !== undefined ? is_pinned : announcement.is_pinned,
    expires_at: expires_at !== undefined ? expires_at : announcement.expires_at
  });

  res.json({
    success: true,
    message: 'Announcement updated successfully',
    data: announcement
  });
});

/**
 * @desc    Delete branch announcement
 * @route   DELETE /api/branch-announcements/:id
 * @access  Private/BranchAdmin
 */
exports.deleteBranchAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await BranchAnnouncement.findOne({
    where: {
      id: req.params.id,
      branch_id: req.user.branch_id
    }
  });

  if (!announcement) {
    throw new AppError('Announcement not found', 404);
  }

  await announcement.destroy();

  res.json({
    success: true,
    message: 'Announcement deleted successfully'
  });
});
