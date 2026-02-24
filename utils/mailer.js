import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
});

export async function sendOTPEmail(toEmail, otp) {
  try {
    const info = await transporter.sendMail({
      from: `"SynapSee VR Proctor" <${process.env.BREVO_SENDER_EMAIL}>`,
      to: toEmail,
      subject: "Your SynapSee OTP Code",
      html: `
        <h2>SynapSee VR Proctor</h2>
        <p>Your One-Time Password (OTP) is:</p>
        <h1 style="letter-spacing:4px;">${otp}</h1>
        <p>This code will expire in 5 minutes.</p>
      `,
    });

    console.log("BREVO SUCCESS:", info.messageId);
  } catch (error) {
    console.error("BREVO ERROR:", error);
    throw error;
  }
}
