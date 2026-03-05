import express from "express";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

/*
==================================================
VR → Backend: Submit Exam Score
==================================================
*/

router.post("/score", async (req, res) => {
  const { session_id, device_id, score, max_score, submitted_at } = req.body;

  console.log("📥 VR SCORE PAYLOAD:", req.body);

  // ================================
  // VALIDATION
  // ================================
  if (!session_id) {
    return res.status(400).json({
      error: "session_id is required",
    });
  }

  if (score == null || max_score == null) {
    return res.status(400).json({
      error: "score and max_score are required",
    });
  }

  try {
    // ================================
    // VERIFY SESSION EXISTS
    // ================================
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        error: "Session not found",
      });
    }

    // ================================
    // UPDATE SCORE
    // ================================
    const { error } = await supabase
      .from("sessions")
      .update({
        score: score,
        max_score: max_score,
        ended_at: submitted_at || new Date().toISOString(),
      })
      .eq("id", session_id);

    if (error) {
      console.error("❌ Supabase update error:", error);
      throw error;
    }

    console.log("📊 VR SCORE SAVED:", {
      session_id,
      device_id,
      score,
      max_score,
    });

    return res.json({
      status: "ok",
      message: "Score submitted successfully",
      session_id,
      score,
      max_score,
    });
  } catch (err) {
    console.error("💥 VR SCORE ERROR:", err);

    return res.status(500).json({
      error: "Failed to save score",
    });
  }
});

export default router;
