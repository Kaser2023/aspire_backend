const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const auditLogController = require('../controllers/auditLog.controller');

router.use(authenticate);

router.get('/entity/:entityType/:entityId', auditLogController.getEntityHistory);
router.get('/module/:module', auditLogController.getModuleHistory);

module.exports = router;
