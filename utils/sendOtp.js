
const nodemailer = require('nodemailer');

async function sendOtpEmail(toEmail, otp) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Your Safemeet OTP Code',
    html: `<p>Your OTP is: <b>${otp}</b></p><p>This OTP will expire in 5 minutes.</p>`,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendOtpEmail;
