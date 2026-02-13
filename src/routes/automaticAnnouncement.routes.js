const express = require('express');
const router = express.Router();
const automaticAnnouncementController = require('../controllers/automaticAnnouncement.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authenticate);

// Get all automatic announcements
router.get('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  automaticAnnouncementController.getAllAutomaticAnnouncements
);

// Get automatic announcement by ID
router.get('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  automaticAnnouncementController.getAutomaticAnnouncementById
);

// Create new automatic announcement
router.post('/',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  automaticAnnouncementController.createAutomaticAnnouncement
);

// Update automatic announcement
router.put('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  automaticAnnouncementController.updateAutomaticAnnouncement
);

// Delete automatic announcement
router.delete('/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  automaticAnnouncementController.deleteAutomaticAnnouncement
);

// Toggle automatic announcement active status
router.patch('/:id/toggle',
  authorize(ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.BRANCH_ADMIN),
  automaticAnnouncementController.toggleAutomaticAnnouncement
);

module.exports = router;
