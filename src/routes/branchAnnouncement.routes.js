const express = require('express');
const router = express.Router();
const branchAnnouncementController = require('../controllers/branchAnnouncement.controller');
const { authenticate, authorize, ROLES } = require('../middleware/auth');

// All routes require authentication and branch_admin role
router.use(authenticate);
router.use(authorize(ROLES.BRANCH_ADMIN));

router.route('/')
  .get(branchAnnouncementController.getAllBranchAnnouncements)
  .post(branchAnnouncementController.createBranchAnnouncement);

router.route('/:id')
  .get(branchAnnouncementController.getBranchAnnouncementById)
  .put(branchAnnouncementController.updateBranchAnnouncement)
  .delete(branchAnnouncementController.deleteBranchAnnouncement);

module.exports = router;
