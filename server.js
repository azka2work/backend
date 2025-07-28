const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

dotenv.config();

const app = express();

// 🔁 In-memory store for OTPs
const otpStore = {}; // { "phoneNumber": "123456" }

// 🔐 Firebase Admin SDK Initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (Object.keys(serviceAccount).length > 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  console.log('✅ Firebase Admin SDK initialized');
} else {
  console.warn('⚠️ Firebase Service Account not configured - notification features will be disabled');
}

// 🌐 Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ✅ Root route for Railway
app.get('/', (req, res) => {
  res.send('✅ SafeMeet backend is live on Railway!');
});

// ⚙️ Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safemeet_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// 📦 Mongoose schema for storing user FCM tokens
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  fcmToken: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const UserToken = mongoose.model('UserToken', userSchema);

////////////////////////////////////////////////////////////
// 🔐 OTP Routes
////////////////////////////////////////////////////////////

app.post('/api/send-otp', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required'
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[phoneNumber] = otp;

  console.log(`[OTP GENERATED] ${phoneNumber} → ${otp}`);

  res.status(200).json({
    success: true,
    message: 'OTP sent successfully',
    otp // 🧪 Only for testing – remove in production
  });
});

app.post('/api/verify-otp', async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({
      success: false,
      message: 'Phone number and OTP are required'
    });
  }

  const storedOtp = otpStore[phoneNumber];
  if (storedOtp === otp) {
    console.log(`[OTP VERIFIED] ${phoneNumber}`);
    delete otpStore[phoneNumber]; // Clean up

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });
  } else {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired OTP'
    });
  }
});

////////////////////////////////////////////////////////////
// 📲 FCM Token Register & Notification Routes
////////////////////////////////////////////////////////////

app.post('/api/register-token', async (req, res) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({
        success: false,
        message: 'User ID and token are required'
      });
    }

    await UserToken.findOneAndUpdate(
      { userId },
      { fcmToken: token, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    console.log(`✅ Registered FCM token for user: ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Token registered successfully'
    });
  } catch (error) {
    console.error('❌ Error registering token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register token',
      error: error.message
    });
  }
});

app.post('/api/send-notification', async (req, res) => {
  if (!admin.apps.length) {
    return res.status(503).json({
      success: false,
      message: 'Firebase not configured - notification service unavailable'
    });
  }

  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'User ID, title, and body are required'
      });
    }

    const user = await UserToken.findOne({ userId });
    if (!user || !user.fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'User token not found'
      });
    }

    const message = {
      notification: { title, body },
      data: data || {},
      token: user.fcmToken
    };

    const response = await admin.messaging().send(message);
    console.log(`📤 Notification sent to ${userId}:`, response);

    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('❌ Error sending notification:', error);

    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await UserToken.findOneAndUpdate(
        { userId: req.body.userId },
        { $unset: { fcmToken: 1 } }
      );
      console.log(`🗑️ Removed invalid token for user ${req.body.userId}`);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message,
      code: error.code
    });
  }
});

////////////////////////////////////////////////////////////
// 🧪 Health Check Endpoint
////////////////////////////////////////////////////////////

app.get('/api/health', (req, res) => {
  const status = {
    status: 'OK',
    message: 'Server is running',
    services: {
      database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      firebase: admin.apps.length > 0 ? 'Available' : 'Unavailable'
    },
    timestamp: new Date()
  };
  res.status(200).json(status);
});

////////////////////////////////////////////////////////////
// 🛠️ Global Error Handler
////////////////////////////////////////////////////////////

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

////////////////////////////////////////////////////////////
// 🚀 Start the Server
////////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running and accessible at:`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → http://<your-PC-IP>:${PORT} (for mobile access)`);
});

module.exports = app;
