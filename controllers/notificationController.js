const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-sdk.json');

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const sendPushNotification = async (req, res) => {
  const { targetFcmToken, title, body } = req.body;


  if (!targetFcmToken || !title || !body) {
    return res.status(400).json({
      success: false,
      message: 'Missing targetFcmToken, title, or body',
    });
  }

  // Construct message object
  const message = {
    token: targetFcmToken,
    notification: {
      title: title,
      body: body,
    },
  };

  try {
    // Send notification via Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log('✅ Notification sent:', response);
    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      response,
    });
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message,
    });
  }
};

module.exports = sendPushNotification;
