const User = require('../models/User');
const sendOtpEmail = require('../utils/sendOtp');
const sendFcmNotification = require('../utils/sendFcm');
const bcrypt = require('bcrypt');

// ✅ SEND OTP
exports.sendOtp = async (req, res) => {
  console.log('[DEBUG] 🔍 Incoming /send-otp body:', req.body);

  const email = req.body.email?.trim();
  const fcmToken = req.body.fcmToken;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`[DEBUG] /send-otp for ${email}, OTP: ${otp}`);
  console.log(`[DEBUG] FCM Token: ${fcmToken}`);

  try {
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ email, otp, fcmToken });
    } else {
      user.otp = otp;
      if (fcmToken) user.fcmToken = fcmToken;
    }

    await user.save();
    console.log('[DEBUG] ✅ User saved. Sending OTP email...');

    await sendOtpEmail(email, otp);
    console.log('[DEBUG] ✅ Email sent');

    if (user.fcmToken) {
      await sendFcmNotification(
        user.fcmToken,
        'Verification Code Sent',
        'A verification code has been sent to your email.'
      );
    }

    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('[ERROR /send-otp]', err);
    res.status(500).json({ success: false, message: 'Error sending OTP' });
  }
};

// ✅ VERIFY OTP
exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  console.log('[DEBUG] 🛂 Verifying OTP:', req.body);

  try {
    const user = await User.findOne({ email, otp });

    if (!user) {
      return res.json({ success: false, message: 'Invalid OTP' });
    }

    user.otpVerified = true;
    await user.save();

    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error('[ERROR /verify-otp]', err);
    res.status(500).json({ success: false, message: 'Error verifying OTP' });
  }
};

// ✅ SIGNUP
exports.signup = async (req, res) => {
  const { fullName, email, password, phone, fcmToken } = req.body;
  console.log('[DEBUG] 📝 Signup Data:', req.body);

  try {
    const user = await User.findOne({ email, otpVerified: true });

    if (!user) {
      return res.json({ success: false, message: 'OTP not verified' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.fullName = fullName;
    user.password = hashedPassword;
    user.phone = phone;
    if (fcmToken) user.fcmToken = fcmToken;

    await user.save();

    if (user.fcmToken) {
      await sendFcmNotification(
        user.fcmToken,
        'Signup Successful',
        `Welcome to ChatWave, ${user.fullName}! 🎉`
      );
    }

    res.json({ success: true, message: 'Signup successful' });
  } catch (err) {
    console.error('[ERROR /signup]', err);
    res.status(500).json({ success: false, message: 'Error during signup' });
  }
};

// ✅ LOGIN
exports.login = async (req, res) => {
  const { email, password, fcmToken } = req.body;
  console.log('[DEBUG] 🔐 Login request:', req.body);

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.otpVerified) {
      return res.json({ success: false, message: 'OTP not verified' });
    }

    if (fcmToken) {
      user.fcmToken = fcmToken;
      await user.save();
    }

    res.json({ success: true, message: 'Login successful' });
  } catch (err) {
    console.error('[ERROR /login]', err);
    res.status(500).json({ success: false, message: 'Error during login' });
  }
};

// ✅ Send Push Notification
exports.sendNotification = async (req, res) => {
  const { recipientEmail, title, message } = req.body;
  console.log('[DEBUG] 📢 Sending push to:', recipientEmail);

  try {
    const recipient = await User.findOne({ email: recipientEmail });

    if (!recipient || !recipient.fcmToken) {
      return res.status(404).json({ success: false, message: 'Recipient not found or FCM token missing' });
    }

    await sendFcmNotification(recipient.fcmToken, title, message);

    res.json({ success: true, message: 'Notification sent successfully' });
  } catch (err) {
    console.error('[ERROR /send-notification]', err);
    res.status(500).json({ success: false, message: 'Error sending notification' });
  }
};
