const { AutomaticAnnouncement, User } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');
const { ROLES } = require('../config/constants');

const buildBranchAdminAudience = (audience, branchId) => {
  let roles = ['parent', 'coach', 'player'];
  let users = [];

  if (audience && typeof audience === 'object') {
    if (audience.type === 'roles' && Array.isArray(audience.roles) && audience.roles.length > 0) {
      roles = audience.roles;
    } else if (audience.type === 'users' && Array.isArray(audience.users) && audience.users.length > 0) {
      // When targeting specific users, don't include role-based audience
      users = audience.users;
      return {
        type: 'specific',
        branches: {},
        users
      };
    }
  }

  return {
    type: 'specific',
    branches: {
      [branchId]: { roles }
    },
    users
  };
};

/**
 * @desc    Get all automatic announcements
 * @route   GET /api/automatic-announcements
 * @access  Private/Admin
 */
exports.getAllAutomaticAnnouncements = asyncHandler(async (req, res) => {
  console.log('🔍 Backend: Getting all automatic announcements...');
  console.log('📋 Query params:', req.query);
  
  const { page = 1, limit = 10, type, target_audience, is_active } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = {};

  if (type) where.type = type;
  if (target_audience) where.target_audience = target_audience;
  if (is_active !== undefined) where.is_active = is_active === 'true';
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    where.created_by = req.user.id;
  }

  console.log('🔎 Where clause:', where);

  try {
    const announcements = await AutomaticAnnouncement.findAndCountAll({
      where,
      include: [
        { association: 'creator', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ],
      offset,
      limit: limitNum,
      order: [['created_at', 'DESC']]
    });

    console.log('📊 Found announcements:', announcements.rows.length);
    console.log('📋 Announcement data:', announcements.rows);

    // Convert Sequelize models to plain JSON
    const plainAnnouncements = announcements.rows.map(announcement => {
      const plain = announcement.get({ plain: true });
      console.log('🔍 Plain announcement:', plain);
      return plain;
    });

    const response = formatPaginationResponse(
      { ...announcements, rows: plainAnnouncements }, 
      page, 
      limit
    );

    console.log('✅ Sending response:', response);

    res.json({
      success: true,
      ...response
    });
  } catch (error) {
    console.error('❌ Database error:', error);
    throw error;
  }
});

/**
 * @desc    Get automatic announcement by ID
 * @route   GET /api/automatic-announcements/:id
 * @access  Private/Admin
 */
exports.getAutomaticAnnouncementById = asyncHandler(async (req, res) => {
  const where = req.user.role === ROLES.BRANCH_ADMIN
    ? { id: req.params.id, created_by: req.user.id }
    : { id: req.params.id };

  const announcement = await AutomaticAnnouncement.findOne({
    where,
    include: [
      { association: 'creator', attributes: ['id', 'first_name', 'last_name', 'email'] }
    ]
  });

  if (!announcement) {
    throw new AppError('Automatic announcement not found', 404);
  }

  res.json({
    success: true,
    data: announcement
  });
});

/**
 * @desc    Create automatic announcement
 * @route   POST /api/automatic-announcements
 * @access  Private/Admin
 */
exports.createAutomaticAnnouncement = asyncHandler(async (req, res) => {
  console.log('🚀 Backend: Creating automatic announcement...');
  console.log('📋 Request body:', req.body);
  console.log('👤 User ID:', req.user.id);
  
  const {
    name,
    target_audience,
    schedule_type,
    start_date,
    end_date,
    send_days,
    send_time,
    message,
    send_notification,
    is_active
  } = req.body;

  // Validate required fields
  if (!name || !message || !send_time) {
    console.log('❌ Validation failed - missing required fields');
    throw new AppError('Please provide all required fields (name, message, send_time)', 400);
  }

  // Validate based on schedule type
  if (schedule_type === 'date_range') {
    if (!start_date || !end_date) {
      console.log('❌ Validation failed - missing date range');
      throw new AppError('Please provide start_date and end_date for date range schedule', 400);
    }
  } else if (schedule_type === 'specific_days') {
    if (!send_days || send_days.length === 0) {
      console.log('❌ Validation failed - missing send days');
      throw new AppError('Please provide send_days for specific days schedule', 400);
    }
  }

  try {
    let normalizedAudience = target_audience || 'all';
    if (req.user.role === ROLES.BRANCH_ADMIN) {
      if (!req.user.branch_id) {
        throw new AppError('Branch ID is required', 400);
      }
      normalizedAudience = buildBranchAdminAudience(target_audience, req.user.branch_id);
    }

    const announcement = await AutomaticAnnouncement.create({
      name,
      target_audience: normalizedAudience,
      schedule_type: schedule_type || 'date_range',
      start_date: start_date || null,
      end_date: end_date || null,
      send_days: send_days || null,
      send_time,
      message,
      send_notification: send_notification !== false,
      is_active: is_active !== false,
      created_by: req.user.id
    });

    console.log('✅ Created announcement:', announcement);

    // Fetch the created announcement with creator info
    const createdAnnouncement = await AutomaticAnnouncement.findByPk(announcement.id, {
      include: [
        { association: 'creator', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ]
    });

    console.log('✅ Fetched created announcement with creator:', createdAnnouncement);

    // Convert to plain JSON
    const plainAnnouncement = createdAnnouncement.get({ plain: true });
    console.log('🔍 Plain created announcement:', plainAnnouncement);

    res.status(201).json({
      success: true,
      message: 'Automatic announcement created successfully',
      data: plainAnnouncement
    });
  } catch (error) {
    console.error('❌ Database error creating announcement:', error);
    throw error;
  }
});

/**
 * @desc    Update automatic announcement
 * @route   PUT /api/automatic-announcements/:id
 * @access  Private/Admin
 */
exports.updateAutomaticAnnouncement = asyncHandler(async (req, res) => {
  const where = req.user.role === ROLES.BRANCH_ADMIN
    ? { id: req.params.id, created_by: req.user.id }
    : { id: req.params.id };

  const announcement = await AutomaticAnnouncement.findOne({ where });

  if (!announcement) {
    throw new AppError('Automatic announcement not found', 404);
  }

  const {
    name,
    target_audience,
    schedule_type,
    start_date,
    end_date,
    send_time,
    send_days,
    message,
    send_notification,
    is_active
  } = req.body;

  let normalizedAudience = target_audience;
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    if (!req.user.branch_id) {
      throw new AppError('Branch ID is required', 400);
    }
    normalizedAudience = buildBranchAdminAudience(target_audience, req.user.branch_id);
  }

  await announcement.update({
    name,
    target_audience: normalizedAudience,
    schedule_type,
    start_date,
    end_date,
    send_time,
    send_days,
    message,
    send_notification,
    is_active
  });

  // Fetch updated announcement with creator info
  const updatedAnnouncement = await AutomaticAnnouncement.findByPk(announcement.id, {
    include: [
      { association: 'creator', attributes: ['id', 'first_name', 'last_name', 'email'] }
    ]
  });

  res.json({
    success: true,
    message: 'Automatic announcement updated successfully',
    data: updatedAnnouncement
  });
});

/**
 * @desc    Delete automatic announcement
 * @route   DELETE /api/automatic-announcements/:id
 * @access  Private/Admin
 */
exports.deleteAutomaticAnnouncement = asyncHandler(async (req, res) => {
  const where = req.user.role === ROLES.BRANCH_ADMIN
    ? { id: req.params.id, created_by: req.user.id }
    : { id: req.params.id };

  const announcement = await AutomaticAnnouncement.findOne({ where });

  if (!announcement) {
    throw new AppError('Automatic announcement not found', 404);
  }

  await announcement.destroy();

  res.json({
    success: true,
    message: 'Automatic announcement deleted successfully'
  });
});

/**
 * @desc    Toggle automatic announcement active status
 * @route   PATCH /api/automatic-announcements/:id/toggle
 * @access  Private/Admin
 */
exports.toggleAutomaticAnnouncement = asyncHandler(async (req, res) => {
  const where = req.user.role === ROLES.BRANCH_ADMIN
    ? { id: req.params.id, created_by: req.user.id }
    : { id: req.params.id };

  const announcement = await AutomaticAnnouncement.findOne({ where });

  if (!announcement) {
    throw new AppError('Automatic announcement not found', 404);
  }

  await announcement.update({
    is_active: !announcement.is_active
  });

  res.json({
    success: true,
    message: `Automatic announcement ${announcement.is_active ? 'activated' : 'deactivated'} successfully`,
    data: announcement
  });
});
