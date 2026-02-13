const { Notification, User } = require('../models');
const { Op } = require('sequelize');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { paginate, formatPaginationResponse } = require('../utils/helpers');

/**
 * @desc    Get all notifications for current user
 * @route   GET /api/notifications
 * @access  Private
 */
exports.getMyNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, is_read } = req.query;
  const { offset, limit: limitNum } = paginate(page, limit);

  const where = { user_id: req.user.id };
  
  if (is_read !== undefined) {
    where.is_read = is_read === 'true';
  }

  const notifications = await Notification.findAndCountAll({
    where,
    offset,
    limit: limitNum,
    order: [['created_at', 'DESC']]
  });

  const response = formatPaginationResponse(notifications, page, limit);

  res.json({
    success: true,
    ...response
  });
});

/**
 * @desc    Get unread count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.count({
    where: {
      user_id: req.user.id,
      is_read: false
    }
  });

  res.json({
    success: true,
    data: { count }
  });
});

/**
 * @desc    Mark notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private
 */
exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    where: {
      id: req.params.id,
      user_id: req.user.id
    }
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  await notification.update({
    is_read: true,
    read_at: new Date()
  });

  res.json({
    success: true,
    message: 'Notification marked as read',
    data: notification
  });
});

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/read-all
 * @access  Private
 */
exports.markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.update(
    {
      is_read: true,
      read_at: new Date()
    },
    {
      where: {
        user_id: req.user.id,
        is_read: false
      }
    }
  );

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
});

/**
 * @desc    Delete notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    where: {
      id: req.params.id,
      user_id: req.user.id
    }
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  await notification.destroy();

  res.json({
    success: true,
    message: 'Notification deleted'
  });
});

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/notifications/clear-read
 * @access  Private
 */
exports.clearReadNotifications = asyncHandler(async (req, res) => {
  await Notification.destroy({
    where: {
      user_id: req.user.id,
      is_read: true
    }
  });

  res.json({
    success: true,
    message: 'Read notifications cleared'
  });
});
