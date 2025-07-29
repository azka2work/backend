const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

dotenv.config();
const app = express();

// 🌐 Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ✅ Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (Object.keys(serviceAccount).length > 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  console.log('✅ Firebase initialized');
} else {
  console.warn('⚠️ Firebase credentials missing');
}

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safemeet_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.error('❌ MongoDB error:', err));

// ✅ Mongoose Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String },
  fcmToken: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,         // Your Gmail address
    pass: process.env.EMAIL_PASS          // App-specific password
  }
});

// ✅ Helper: OTP Generator
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

// ✅ API: Send OTP
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const otp = generateOtp();

  try {
    await User.findOneAndUpdate({ email }, { otp }, { upsert: true, new: true });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}`
    };

    await transporter.sendMail(mailOptions);
    console.log(`[OTP SENT] ${email}: ${otp}`);

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('[SEND OTP ERROR]', error);
    return res.status(500).json({ success: false, message: 'Error sending OTP' });
  }
});

// ✅ API: Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

  try {
    const user = await User.findOne({ email });
    if (user && user.otp === otp) {
      user.otp = null;
      await user.save();

      console.log(`[OTP VERIFIED] ${email}`);
      return res.status(200).json({ success: true, message: 'OTP verified' });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error verifying OTP' });
  }
});

// ✅ API: Register FCM Token
app.post('/api/register-token', async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) return res.status(400).json({ success: false, message: 'Email and token are required' });

  try {
    await User.findOneAndUpdate({ email }, { fcmToken: token, updatedAt: Date.now() }, { upsert: true });
    console.log(`[FCM REGISTERED] ${email}`);
    return res.status(200).json({ success: true, message: 'Token registered' });
  } catch (error) {
    console.error('[FCM REG ERROR]', error);
    return res.status(500).json({ success: false, message: 'Token registration failed' });
  }
});

// ✅ API: Send Notification
app.post('/api/send-notification', async (req, res) => {
  const { email, title, body, data } = req.body;
  if (!email || !title || !body) return res.status(400).json({ success: false, message: 'Required fields missing' });

  if (!admin.apps.length) return res.status(503).json({ success: false, message: 'Firebase not configured' });

  try {
    const user = await User.findOne({ email });
    if (!user || !user.fcmToken) {
      return res.status(404).json({ success: false, message: 'User or token not found' });
    }

    const message = {
      notification: { title, body },
      data: data || {},
      token: user.fcmToken
    };

    const response = await admin.messaging().send(message);
    console.log(`[NOTIFICATION SENT] ${email}`);
    return res.status(200).json({ success: true, message: 'Notification sent', messageId: response });
  } catch (error) {
    console.error('[NOTIFY ERROR]', error);
    return res.status(500).json({ success: false, message: 'Notification failed', error: error.message });
  }
});

// ✅ API: Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    firebase: admin.apps.length > 0 ? 'Available' : 'Unavailable',
    time: new Date()
  });
});

// ✅ Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SafeMeet Backend running at http://localhost:${PORT}`);
});

module.exports = app;
