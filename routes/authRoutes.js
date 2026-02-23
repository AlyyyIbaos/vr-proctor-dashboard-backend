import express from "express";
import rateLimit from "express-rate-limit";
import {
  registerStudent,
  requestOtp,
  verifyOtp,
} from "../controllers/authController.js";

const router = express.Router();

/**
 * ============================
 * RATE LIMITERS
 * ============================
 */

// Limit OTP requests: max 3 every 10 minutes per IP
const requestOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { error: "Too many OTP requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit OTP verification attempts: max 5 every 5 minutes per IP
const verifyOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: "Too many OTP attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register-student", registerStudent);
router.post("/request-otp", requestOtpLimiter, requestOtp);
router.post("/verify-otp", verifyOtpLimiter, verifyOtp);

export default router;
