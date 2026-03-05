import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/ping", (req, res) => {
    return res.json({
      status: "pong",
      timestamp: new Date().toISOString(),
    });
  });

  /*
  ==================================================
  VR TELEMETRY
  ==================================================
  */

  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, question_index, window_index, window } = req.body;

      if (!session_id || !window) {
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      // =========================
      // VALIDATE SESSION
      // =========================
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", session_id)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      if (session.status !== "active") {
        return res.status(403).json({ error: "Session not active" });
      }

      // =========================
      // NORMALIZE WINDOW SIZE
      // =========================
      let normalizedWindow = window;

      if (Array.isArray(window) && window.length > 120) {
        normalizedWindow = window.slice(0, 120);
      }

      if (Array.isArray(window) && window.length < 120) {
        return res.status(400).json({
          error: `window must have 120 rows (got ${window.length})`,
        });
      }

      // =========================
      // CALL AI INFERENCE
      // =========================
      const inferenceResponse = await axios.post(
        `${process.env.INFERENCE_SERVICE_URL}/infer_window`,
        {
          session_id,
          window: normalizedWindow,
        },
        { timeout: 120000 },
      );

      const data = inferenceResponse.data;

      const {
        prob_cheat,
        pred_raw,
        cat_active,
        cat_transition,
        model_latency_ms,
        total_latency_ms,
      } = data;

      const decision_mode = process.env.USE_CAT === "true" ? "cat" : "fixed";

      // =========================
      // LOG WINDOW
      // =========================
      await supabase.from("inference_logs").insert([
        {
          session_id,
          question_index,
          window_index,
          prob_cheat,
          pred_raw,
          cat_active,
          cat_transition,
          decision_mode,
          model_latency_ms,
          total_latency_ms,
        },
      ]);

      // =========================
      // BEHAVIORAL EVENT INSERT
      // =========================
      const eventType =
        cat_active === 1
          ? "cheating"
          : prob_cheat > 0.4
            ? "suspicious"
            : "normal";

      await supabase.from("proctor_events").insert([
        {
          session_id,
          event_type: eventType,
          reason_code: "ai_behavior_detection",
          confidence_score: prob_cheat,
          risk_score: prob_cheat,
        },
      ]);

      // =========================
      // ESCALATE SESSION RISK
      // =========================
      if (cat_active === 1) {
        await supabase
          .from("sessions")
          .update({ risk_level: "high" })
          .eq("id", session_id);
      }

      // =========================
      // SOCKET LIVE UPDATE
      // =========================
      io.to(session_id).emit("new_alert", {
        session_id,
        event_type: "behavioral",
        severity:
          cat_active === 1 ? "high" : prob_cheat > 0.4 ? "medium" : "low",
        confidence_level: prob_cheat,
        question_index,
        details: "AI behavioral detection",
        detected_at: new Date().toISOString(),
      });

      return res.json({
        status: "ok",
        prob_cheat,
        pred_raw,
        cat_active,
        decision_mode,
      });
    } catch (err) {
      console.error("💥 TELEMETRY ERROR:", err.response?.data || err.message);

      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
