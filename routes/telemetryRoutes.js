import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

// =========================
// INFERENCE CONTROL
// =========================
const lastInferenceRun = new Map();

// How often inference is allowed per session
const INFERENCE_MIN_INTERVAL_MS = 15000; // 🔥 15 seconds

// Backoff if inference service rate-limits us
const BACKOFF_MS = 60000; // 1 minute

// 🔥 LOWERED DEMO THRESHOLD (CNN-LSTM sensitivity)
const DEMO_THRESHOLD = 0.3;

export default function telemetryRoutes(io) {
  const router = express.Router();

  /**
   * VR → Backend Telemetry (SEQUENCE MODE)
   * Receives 60-frame sequences from Unity
   */
  router.post("/telemetry", async (req, res) => {
    try {
      const {
        session_id,
        device_id,
        scene_name,
        telemetry, // 👈 List<float[]> from Unity
      } = req.body;

      // =========================
      // VALIDATION
      // =========================
      if (
        !session_id ||
        !device_id ||
        !Array.isArray(telemetry) ||
        telemetry.length === 0
      ) {
        return res.status(400).json({
          error: "Invalid telemetry payload",
        });
      }

      const now = Date.now();
      const lastRun = lastInferenceRun.get(session_id);

      // =========================
      // PER-SESSION RATE LIMIT
      // =========================
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        return res.json({
          status: "skipped (cooldown)",
        });
      }

      // =========================
      // CALL CNN-LSTM INFERENCE
      // =========================
      let inferenceResponse;
      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          {
            telemetry, // 👈 FULL SEQUENCE
          },
          {
            timeout: 90000,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
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
      // DECISION LOGIC
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
        model: "cnn-lstm",
        timestamp: new Date().toISOString(),
      });

      // =========================
      // SAVE ONLY IF SUSPICIOUS
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
              model: "cnn-lstm",
              sequence_length: telemetry.length,
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

      // =========================
      // RESPONSE
      // =========================
      return res.json({
        status: "ok",
        prediction,
        confidence: cheating_score,
        severity,
        model: "cnn-lstm",
      });
    } catch (error) {
      console.error("❌ VR Telemetry Processing Error:", error);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
