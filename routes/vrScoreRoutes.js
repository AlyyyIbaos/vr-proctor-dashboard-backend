import express from "express";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

/**
 * VR → Backend: submit exam score
 */
router.post("/score", async (req, res) => {
  const { session_id, device_id, score, max_score, submitted_at } = req.body;

  // Basic validation (no auth yet)
  if (!session_id || score == null || max_score == null) {
    return res.status(400).json({
      error: "Missing required fields",
    });
  }

  try {
    // Update session score
    const { error } = await supabase
      .from("sessions")
      .update({
        score,
        max_score,
        ended_at: submitted_at || new Date().toISOString(),
      })
      .eq("id", session_id);

    if (error) throw error;

    console.log("📊 VR SCORE RECEIVED:", {
      session_id,
      device_id,
      score,
      max_score,
    });

    res.json({
      status: "ok",
      message: "Score submitted successfully",
    });
  } catch (err) {
    console.error("VR SCORE ERROR:", err);
    res.status(500).json({ error: "Failed to save score" });
  }
});

export default router;
