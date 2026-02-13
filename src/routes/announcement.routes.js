const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcement.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { announcementValidators, commonValidators } = require('../utils/validators');
const { uploadAnnouncementImage } = require('../middleware/upload');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all announcements (filtered by role)
router.get('/',
  commonValidators.pagination,
  validate,
  announcementController.getAllAnnouncements
);

// Get published announcements for users
router.get('/feed', announcementController.getAnnouncementsFeed);

// Get announcement by ID
router.get('/:id', announcementController.getAnnouncementById);

// Create new announcement
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  announcementValidators.create,
  validate,
  announcementController.createAnnouncement
);

// Update announcement
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  announcementValidators.update,
  validate,
  announcementController.updateAnnouncement
);

// Delete announcement
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  announcementController.deleteAnnouncement
);

// Upload announcement image
router.post('/:id/image',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  uploadAnnouncementImage,
  announcementController.uploadImage
);

// Publish announcement
router.patch('/:id/publish',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  announcementController.publishAnnouncement
);

// Unpublish announcement
router.patch('/:id/unpublish',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  announcementController.unpublishAnnouncement
);

// Toggle pin status
router.patch('/:id/pin',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  announcementController.togglePinStatus
);

// Increment view count
router.post('/:id/view', announcementController.incrementViewCount);

module.exports = router;

