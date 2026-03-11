import express from "express";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

/*
==================================================
VR SESSION VALIDATION
POST /api/vr/session/validate
==================================================
VR sends a short session_code like:
{
  "session_code": "F8K2P9"
}

Backend returns the real session_id.
*/
router.post("/session/validate", async (req, res) => {
  try {
    const { session_code } = req.body;

    if (!session_code) {
      return res.status(400).json({
        error: "session_code is required",
      });
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .select(
        `
        id,
        exam_id,
        status,
        vr_token_expires_at,
        exams (
          title,
          duration_minutes
        )
      `,
      )
      .eq("session_code", session_code)
      .single();

    if (error || !session) {
      return res.status(404).json({
        valid: false,
        error: "Invalid session code",
      });
    }

    if (session.status !== "active") {
      return res.status(403).json({
        valid: false,
        error: "Session is not active",
      });
    }

    if (
      session.vr_token_expires_at &&
      new Date(session.vr_token_expires_at) < new Date()
    ) {
      return res.status(403).json({
        valid: false,
        error: "VR session token expired",
      });
    }

    return res.json({
      valid: true,
      session_id: session.id,
      exam_id: session.exam_id,
      exam_title: session.exams?.title || "Exam",
      duration_minutes: session.exams?.duration_minutes || null,
    });
  } catch (err) {
    console.error("VR SESSION VALIDATION ERROR:", err);

    return res.status(500).json({
      error: "Session validation failed",
    });
  }
});

export default router;
