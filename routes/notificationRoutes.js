const express = require('express');
const router = express.Router();
const sendPushNotification = require('../controllers/notificationController');

router.post('/send-notification', sendPushNotification);

module.exports = router;
