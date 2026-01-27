import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";
import detectionConfig from "../config/detectionConfig.js";

// =========================
// INFERENCE COOLDOWN CONFIG
// =========================
const lastInferenceCall = new Map();
const INFERENCE_COOLDOWN_MS = 10000; // 10 seconds

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    try {
      const {
        session_id,
        device_id,
        scene_name,
        telemetry,
      } = req.body;

      // =========================
      // VALIDATION
      // =========================
      if (!session_id || !device_id || !telemetry) {
        return res.status(400).json({
          error: "Missing required telemetry fields",
        });
      }

      // =========================
      // COOLDOWN CHECK
      // =========================
      const lastTime = lastInferenceCall.get(session_id);
      const now = Date.now();

      if (lastTime && now - lastTime < INFERENCE_COOLDOWN_MS) {
        return res.json({
          status: "skipped (cooldown active)",
        });
      }

      lastInferenceCall.set(session_id, now);

      // =========================
      // CALL INFERENCE SERVICE
      // =========================
      let inferenceResponse;

      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          {
            session_id,
            telemetry,
          },
          {
            timeout: 90000,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        if (error.response?.status === 429) {
          console.warn("⚠️ Inference rate-limited, skipping cycle");
          return res.json({
            status: "inference_rate_limited",
          });
        }

        console.error("❌ Inference call failed:", error.message);
        throw error;
      }

      const {
        prediction = "--",
        confidence = 0,
        severity = "low",
      } = inferenceResponse.data;

      // =========================
      // LOG + ALERT
      // =========================
      if (prediction !== "--") {
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

        const risk_level =
          detectionConfig.SEVERITY_RISK_MAP[severity] || "Low";

        await supabase
          .from("sessions")
          .update({ risk_level })
          .eq("id", session_id);

        io.emit("new_alert", data);
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
