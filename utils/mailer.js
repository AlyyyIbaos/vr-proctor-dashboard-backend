import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOTPEmail(toEmail, otp) {
  await resend.emails.send({
    from: "SynapSee <alyssadeniseibaos@gmail.com>",
    to: toEmail,
    subject: "Your SynapSee OTP Code",
    html: `
      <h2>SynapSee VR Proctor System</h2>
      <p>Your One-Time Password (OTP) is:</p>
      <h1 style="letter-spacing:4px;">${otp}</h1>
      <p>This code will expire in 5 minutes.</p>
    `,
  });
}
