import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

// =========================
// INFERENCE CONTROL
// =========================
const lastInferenceRun = new Map();

const INFERENCE_MIN_INTERVAL_MS = 15000; // 15 seconds
const BACKOFF_MS = 60000; // 1 minute
const DEMO_THRESHOLD = 0.3; // lowered sensitivity

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, device_id, scene_name, telemetry } = req.body;

      // -------------------------
      // VALIDATION
      // -------------------------
      if (!session_id || !Array.isArray(telemetry)) {
        return res.status(400).json({
          error: "Invalid telemetry payload",
        });
      }

      if (telemetry.length !== 60) {
        return res.status(400).json({
          error: `Expected 60 frames, got ${telemetry.length}`,
        });
      }

      if (!Array.isArray(telemetry[0]) || telemetry[0].length !== 12) {
        return res.status(400).json({
          error: "Each telemetry frame must have 12 values",
        });
      }

      const now = Date.now();
      const lastRun = lastInferenceRun.get(session_id);

      // -------------------------
      // RATE LIMIT
      // -------------------------
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        return res.json({ status: "skipped (cooldown)" });
      }

      // -------------------------
      // 🔑 KEY FIX: telemetry → sequence
      // -------------------------
      const inferencePayload = {
        sequence: telemetry,
      };

      let inferenceResponse;

      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          inferencePayload,
          {
            timeout: 90000,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
        if (err.response?.status === 429) {
          lastInferenceRun.set(session_id, now + BACKOFF_MS);
          return res.json({ status: "inference_backoff_active" });
        }
        throw err;
      }

      lastInferenceRun.set(session_id, now);

      // -------------------------
      // READ CNN-LSTM RESULT
      // -------------------------
      const { cheating_score = 0, label = "normal" } = inferenceResponse.data;

      const isSuspicious = cheating_score >= DEMO_THRESHOLD;

      const prediction = isSuspicious ? "cheating behavior" : "normal";

      const severity = isSuspicious
        ? cheating_score >= 0.7
          ? "high"
          : cheating_score >= 0.45
            ? "medium"
            : "low"
        : "low";

      // -------------------------
      // 🔔 ALWAYS EMIT LIVE STATUS
      // -------------------------
      io.emit("live_status", {
        session_id,
        prediction,
        confidence: cheating_score,
        severity,
        timestamp: new Date().toISOString(),
      });

      // -------------------------
      // SAVE ONLY IF SUSPICIOUS
      // -------------------------
      if (isSuspicious) {
        const { data } = await supabase
          .from("cheating_logs")
          .insert({
            session_id,
            event_type: "cheating behavior",
            severity,
            confidence_level: cheating_score,
            details: JSON.stringify({
              device_id,
              scene_name,
            }),
          })
          .select()
          .single();

        if (data) {
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
      console.error("❌ Telemetry error:", error.message);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
