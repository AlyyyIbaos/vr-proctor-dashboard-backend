import express from "express";
import {
  createCheatingLog,
  getCheatingLogsBySession,
  finalizeSession,
} from "../controllers/detectionController.js";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

/*
==================================================
VR + AI Detections
==================================================
*/

// Manual cheating logs (object injection, scene tampering, etc.)
router.post("/cheating-log", createCheatingLog);

/*
==================================================
SESSION MONITORING (Proctor Dashboard)
==================================================
*/

// Get all cheating logs for a session (dashboard view)
router.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    // ===============================
    // VALIDATE SESSION EXISTS
    // ===============================
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        error: "Session not found",
      });
    }

    // ===============================
    // FETCH CHEATING LOGS
    // ===============================
    const { data, error } = await supabase
      .from("cheating_logs")
      .select("*")
      .eq("session_id", sessionId)
      .order("detected_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: "Failed to fetch cheating logs",
      });
    }

    res.json(data || []);
  } catch (err) {
    console.error("GET CHEATING LOGS ERROR:", err);
    res.status(500).json({
      error: "Server error",
    });
  }
});

/*
==================================================
FINALIZE SESSION
==================================================
*/

// Finalize session after exam ends (compute final verdict)
router.post("/finalize-session", finalizeSession);

export default router;
