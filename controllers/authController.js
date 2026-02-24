import crypto from "crypto";
import jwt from "jsonwebtoken";
import supabase from "../config/supabaseClient.js";
import { sendOTPEmail } from "../utils/mailer.js";

const OTP_MAX_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 1;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * ============================
 * STUDENT REGISTRATION
 * ============================
 */
export async function registerStudent(req, res) {
  try {
    const { email, full_name, student_number, program, year_level } = req.body;

    if (!email || !full_name || !student_number) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        email,
        full_name,
        role: "student",
      })
      .select()
      .single();

    if (userError || !user) {
      return res
        .status(400)
        .json({ error: userError?.message || "User creation failed" });
    }

    await supabase.from("examinees").insert({
      user_id: user.id,
      full_name,
      student_number,
      program,
      year_level,
    });

    return res.json({ message: "Student registered successfully" });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * ============================
 * REQUEST OTP
 * ============================
 */
export async function requestOtp(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 🔥 Check resend cooldown
    const { data: lastSession } = await supabase
      .from("auth_sessions")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastSession) {
      const secondsSinceLast =
        (Date.now() - new Date(lastSession.created_at).getTime()) / 1000;

      if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          error: `Please wait ${
            RESEND_COOLDOWN_SECONDS - Math.floor(secondsSinceLast)
          } seconds before requesting another OTP.`,
        });
      }
    }

    // Expire old pending sessions
    await supabase
      .from("auth_sessions")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("status", "pending");

    const authExpiry = new Date(Date.now() + 60 * 60 * 1000);

    const { data: authSession } = await supabase
      .from("auth_sessions")
      .insert({
        user_id: user.id,
        status: "pending",
        expires_at: authExpiry,
      })
      .select()
      .single();

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await supabase.from("otp_sessions").insert({
      auth_session_id: authSession.id,
      otp_hash: otpHash,
      expires_at: otpExpiry,
      attempt_count: 0,
    });

    // 🔥 SEND REAL EMAIL
    await sendOTPEmail(email, otp);

    return res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("REQUEST OTP ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * ============================
 * VERIFY OTP
 * ============================
 */
export async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP required" });
    }

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    const { data: user } = await supabase
      .from("users")
      .select("id, full_name, role")
      .eq("email", email)
      .single();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { data: authSession } = await supabase
      .from("auth_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!authSession) {
      return res
        .status(400)
        .json({ error: "No active authentication session" });
    }

    if (
      authSession.locked_until &&
      new Date(authSession.locked_until) > new Date()
    ) {
      return res.status(403).json({
        error: "Account temporarily locked. Try again later.",
      });
    }

    const { data: otpSession } = await supabase
      .from("otp_sessions")
      .select("*")
      .eq("auth_session_id", authSession.id)
      .single();

    if (!otpSession) {
      return res.status(400).json({ error: "OTP session not found" });
    }

    if (
      otpSession.otp_hash !== otpHash ||
      new Date(otpSession.expires_at) < new Date()
    ) {
      const newAttempts = otpSession.attempt_count + 1;

      await supabase
        .from("otp_sessions")
        .update({ attempt_count: newAttempts })
        .eq("id", otpSession.id);

      if (newAttempts >= OTP_MAX_ATTEMPTS) {
        const lockUntil = new Date(
          Date.now() + LOCK_DURATION_MINUTES * 60 * 1000,
        );

        await supabase
          .from("auth_sessions")
          .update({
            status: "failed",
            locked_until: lockUntil,
          })
          .eq("id", authSession.id);

        return res.status(403).json({
          error: "Too many failed attempts. Account locked temporarily.",
        });
      }

      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    await supabase
      .from("auth_sessions")
      .update({
        otp_verified: true,
        status: "verified",
        locked_until: null,
      })
      .eq("id", authSession.id);

    const examToken = jwt.sign(
      {
        auth_session_id: authSession.id,
        user_id: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "90m" },
    );

    return res.json({
      token: examToken,
      full_name: user.full_name,
      role: user.role,
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
