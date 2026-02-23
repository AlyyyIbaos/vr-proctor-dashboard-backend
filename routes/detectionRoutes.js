import express from "express";
import {
  createCheatingLog,
  getCheatingLogsBySession,
  finalizeSession,
} from "../controllers/detectionController.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

// 🔐 Require verified session for all routes
router.use(requireVerifiedSession);

// =========================
// VR + AI Detections
// =========================

// Manual cheating logs (object injection, scene tampering, etc.)
router.post("/cheating-log", createCheatingLog);

// =========================
// Session Monitoring
// =========================

// Get all cheating logs for a session (dashboard view)
router.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { user_id, role } = req.auth;

    // ===============================
    // 🔒 OWNERSHIP VALIDATION
    // ===============================
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, examinee_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // If student → ensure session belongs to them
    if (role === "student") {
      const { data: examinee } = await supabase
        .from("examinees")
        .select("id")
        .eq("user_id", user_id)
        .single();

      if (!examinee || examinee.id !== session.examinee_id) {
        return res.status(403).json({
          error: "Access denied: not your session",
        });
      }
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

    res.json(data);
  } catch (err) {
    console.error("GET CHEATING LOGS ERROR:", err);
    res.status(500).json({
      error: "Server error",
    });
  }
});

// Finalize session after exam ends (compute final verdict)
router.post("/finalize-session", finalizeSession);

export default router;
