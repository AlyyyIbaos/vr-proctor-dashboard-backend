import express from "express";
import {
  createCheatingLog,
  getCheatingLogsBySession,
  finalizeSession,
} from "../controllers/detectionController.js";

const router = express.Router();

// =========================
// VR + AI Detections
// =========================

// Manual cheating logs (object injection, scene tampering, etc.)
router.post("/cheating-log", createCheatingLog);

// =========================
// Session Monitoring
// =========================

// Get all cheating logs for a session (dashboard view)
router.get("/session/:sessionId", getCheatingLogsBySession);

// Finalize session after exam ends (compute final verdict)
router.post("/finalize-session", finalizeSession);

export default router;
