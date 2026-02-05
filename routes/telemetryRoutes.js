import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";
import detectionConfig from "../config/detectionConfig.js";

// =========================
// INFERENCE CONTROL
// =========================
const lastInferenceRun = new Map();
const INFERENCE_MIN_INTERVAL_MS = 60000; // 60 seconds
const BACKOFF_MS = 120000; // 2 minutes on 429

export default function telemetryRoutes(io) {
  const router = express.Router();

  /**
   * VR → Backend Telemetry Endpoint
   */
  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, device_id, scene_name, telemetry } = req.body;

      // =========================
      // VALIDATION
      // =========================
      if (!session_id || !device_id || !telemetry) {
        return res.status(400).json({
          error: "Missing required telemetry fields",
        });
      }

      const now = Date.now();
      const lastRun = lastInferenceRun.get(session_id);

      // =========================
      // HARD INTERVAL GATE
      // =========================
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        return res.json({
          status: "skipped (waiting for inference window)",
        });
      }

      // =========================
      // CALL INFERENCE SERVICE
      // =========================
      let inferenceResponse;
      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          { session_id, telemetry },
          {
            timeout: 90000,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        // 🔴 Cloudflare / rate limit
        if (error.response?.status === 429) {
          console.warn("⚠️ Inference blocked by Cloudflare — backing off");

          lastInferenceRun.set(session_id, now + BACKOFF_MS);

          return res.json({
            status: "inference_backoff_active",
          });
        }

        throw error;
      }

      // ✅ Update last successful inference time
      lastInferenceRun.set(session_id, now);

      // =========================
      // INFERENCE RESULT
      // =========================
      const {
        prediction = "normal",
        confidence = 0,
        severity = "low",
      } = inferenceResponse.data;

      // =========================
      // 🔁 ALWAYS EMIT LIVE STATUS
      // (NORMAL OR NOT)
      // =========================
      io.emit("live_status", {
        session_id,
        prediction,
        confidence,
        severity,
        timestamp: new Date().toISOString(),
      });

      // =========================
      // 🚨 ONLY LOG IF SUSPICIOUS
      // =========================
      let savedLog = null;

      if (prediction !== "normal" && prediction !== "--") {
        const { data, error } = await supabase
          .from("cheating_logs")
          .insert({
            session_id,
            event_type: prediction,
            severity,
            confidence_level: confidence,
            details: JSON.stringify({
              device_id,
              scene_name,
              telemetry_summary: telemetry,
            }),
          })
          .select()
          .single();

        if (error) {
          console.error("❌ Supabase insert error:", error);
          return res.status(500).json({
            error: "Failed to save cheating log",
          });
        }

        savedLog = data;

        // =========================
        // UPDATE SESSION RISK LEVEL
        // =========================
        const risk_level = detectionConfig.SEVERITY_RISK_MAP[severity] || "Low";

        await supabase
          .from("sessions")
          .update({ risk_level })
          .eq("id", session_id);

        // 🚨 Emit alert for cheating
        io.emit("new_alert", savedLog);
      }

      return res.json({
        status: "ok",
        prediction,
        confidence,
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
