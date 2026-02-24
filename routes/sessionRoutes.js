import express from "express";
import supabase from "../config/supabaseClient.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";
import crypto from "crypto";

const router = express.Router();

/*
==================================================
START NEW SESSION
POST /api/sessions/start
==================================================
*/
router.post("/start", requireVerifiedSession, async (req, res) => {
  try {
    const userId = req.auth.user_id;

    // 1️⃣ Find LIVE exam
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("status", "live")
      .limit(1)
      .single();

    if (examError || !exam) {
      return res.status(400).json({
        error: "No live exam available",
      });
    }

    // 2️⃣ Find examinee
    const { data: examinee, error: examineeError } = await supabase
      .from("examinees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (examineeError || !examinee) {
      return res.status(400).json({
        error: "Examinee profile not found",
      });
    }

    // 3️⃣ Generate VR session token
    const vrToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    // 4️⃣ Create session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert([
        {
          exam_id: exam.id,
          examinee_id: examinee.id,
          status: "active",
          risk_level: "low",
          score: 0,
          max_score: 0,
          passed: false,
          started_at: new Date().toISOString(),
          vr_session_token: vrToken,
          vr_token_expires_at: expiresAt,
        },
      ])
      .select("*, exams(*)")
      .single();

    if (sessionError) {
      console.error(sessionError);
      return res.status(500).json({
        error: "Failed to create session",
      });
    }

    // Return session + token to dashboard
    return res.json({
      ...session,
      vr_session_token: vrToken,
    });
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    return res.status(500).json({
      error: "Server error starting session",
    });
  }
});

export default router;
