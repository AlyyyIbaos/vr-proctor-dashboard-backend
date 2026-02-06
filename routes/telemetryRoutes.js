import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

// =========================
// INFERENCE CONTROL
// =========================
const lastInferenceRun = new Map();

// How often we allow inference per session
const INFERENCE_MIN_INTERVAL_MS = 15000; // 🔥 15 seconds (more sensitive)

// Backoff if inference service rate-limits us
const BACKOFF_MS = 60000; // 1 minute

// DEMO / SENSITIVE THRESHOLD
const DEMO_THRESHOLD = 0.3; // 🔥 LOWERED from 0.50

export default function telemetryRoutes(io) {
  const router = express.Router();

  /**
   * VR → Backend Telemetry Endpoint
   */
  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, device_id, scene_name, telemetry } = req.body;

      if (!session_id || !device_id || !telemetry) {
        return res.status(400).json({
          error: "Missing required telemetry fields",
        });
      }

      const now = Date.now();
      const lastRun = lastInferenceRun.get(session_id);

      // =========================
      // RATE LIMIT (PER SESSION)
      // =========================
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        return res.json({
          status: "skipped (cooldown)",
        });
      }

      // =========================
      // CALL INFERENCE SERVICE
      // =========================
      let inferenceResponse;

      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          { telemetry },
          {
            timeout: 90000,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
        // Cloudflare / rate limit protection
        if (err.response?.status === 429) {
          console.warn("⚠️ Inference rate-limited — backing off");
          lastInferenceRun.set(session_id, now + BACKOFF_MS);

          return res.json({
            status: "inference_backoff_active",
          });
        }

        throw err;
      }

      // Update last inference timestamp
      lastInferenceRun.set(session_id, now);

      // =========================
      // READ CNN-LSTM OUTPUT
      // =========================
      const { cheating_score = 0, label = "normal" } = inferenceResponse.data;

      // =========================
      // INTERPRET RESULT (LOWERED SENSITIVITY)
      // =========================
      const isSuspicious = cheating_score >= DEMO_THRESHOLD;

      const prediction = isSuspicious ? "cheating behavior" : "normal";

      const severity = isSuspicious
        ? cheating_score >= 0.7
          ? "high"
          : cheating_score >= 0.45
            ? "medium"
            : "low"
        : "low";

      // =========================
      // 🔔 ALWAYS EMIT LIVE STATUS
      // =========================
      io.emit("live_status", {
        session_id,
        prediction,
        confidence: cheating_score,
        severity,
        timestamp: new Date().toISOString(),
      });

      // =========================
      // SAVE TO DB ONLY IF SUSPICIOUS
      // =========================
      if (isSuspicious) {
        const { data, error } = await supabase
          .from("cheating_logs")
          .insert({
            session_id,
            event_type: "cheating behavior",
            severity,
            confidence_level: cheating_score,
            details: JSON.stringify({
              device_id,
              scene_name,
              telemetry_summary: telemetry,
            }),
          })
          .select()
          .single();

        if (!error && data) {
          // Update session risk level
          const risk_level =
            severity === "high"
              ? "High"
              : severity === "medium"
                ? "Medium"
                : "Low";

          await supabase
            .from("sessions")
            .update({ risk_level })
            .eq("id", session_id);

          // 🚨 Emit cheating alert
          io.emit("new_alert", data);
        }
      }

      return res.json({
        status: "ok",
        prediction,
        confidence: cheating_score,
        severity,
      });
    } catch (error) {
      console.error("❌ VR Telemetry Processing Error:", error.message);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
