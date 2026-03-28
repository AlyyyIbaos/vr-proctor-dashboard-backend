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
MANUAL PROCTOR FLAG (NEW)
==================================================
*/

router.post("/manual-flag", async (req, res) => {
  try {
    const { session_id, question_index, severity } = req.body;

    if (!session_id || !severity) {
      return res.status(400).json({
        error: "Invalid payload",
      });
    }

    // ===============================
    // VALIDATE SESSION
    // ===============================
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

    // ===============================
    // CREATE MANUAL LOG
    // ===============================
    const detected_at = new Date().toISOString();

    const log = {
      session_id,
      event_type: "behavioral",
      severity, // "medium" or "high"
      confidence_level: severity === "high" ? 0.9 : 0.6,
      question_index,
      detected_at,
      details: "Manual override by proctor",
      source: "manual", // 🔥 important for future logic
    };

    // ===============================
    // SAVE TO DB
    // ===============================
    const { error: insertError } = await supabase
      .from("cheating_logs")
      .insert([log]);

    if (insertError) {
      console.error(insertError);
    }

    // ===============================
    // 🔥 ALSO INSERT INTO inference_logs (CRITICAL FIX)
    // ===============================
    await supabase.from("inference_logs").insert([
      {
        session_id,
        question_index,
        prob_cheat: severity === "high" ? 0.95 : 0.7,
        pred_raw: 1,
        cat_active: 1,
        decision_mode: "manual",
        source: "manual", // 🔥 IMPORTANT
        window_index: -1, // optional but safe
      },
    ]);

    // ===============================
    // EMIT REAL-TIME UPDATE
    // ===============================
    req.app.get("io").to(session_id).emit("new_alert", log);

    console.log("🧠 Manual flag emitted:", log);

    res.json({
      status: "ok",
      message: "Manual flag triggered",
    });
  } catch (err) {
    console.error("MANUAL FLAG ERROR:", err);
    res.status(500).json({
      error: "Failed to trigger manual flag",
    });
  }
});

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
