const express = require('express');
const router = express.Router();
const controller = require('../controllers/accountantAutoAnnouncement.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.get('/', authorize(ROLES.ACCOUNTANT), controller.getAll);
router.get('/:id', authorize(ROLES.ACCOUNTANT), controller.getById);
router.post('/', authorize(ROLES.ACCOUNTANT), controller.create);
router.put('/:id', authorize(ROLES.ACCOUNTANT), controller.update);
router.delete('/:id', authorize(ROLES.ACCOUNTANT), controller.remove);
router.patch('/:id/toggle', authorize(ROLES.ACCOUNTANT), controller.toggle);

module.exports = router;
