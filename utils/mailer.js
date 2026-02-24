import axios from "axios";

export async function sendOTPEmail(toEmail, otp) {
  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "SynapSee VR Proctor",
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [
          {
            email: toEmail,
          },
        ],
        subject: "Your SynapSee OTP Code",
        htmlContent: `
          <h2>SynapSee VR Proctor</h2>
          <p>Your One-Time Password (OTP) is:</p>
          <h1 style="letter-spacing:4px;">${otp}</h1>
          <p>This code will expire in 5 minutes.</p>
        `,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("BREVO API SUCCESS:", response.data);
  } catch (error) {
    console.error("BREVO API ERROR:", error.response?.data || error.message);
    throw error;
  }
}
