import express from "express";
import axios from "axios";
import detectionConfig from "../config/detectionConfig.js";
import { createCheatingLog } from "../controllers/detectionController.js";

// =========================
// IN-MEMORY INFERENCE CLOCK
// (session_id → timestamp)
// =========================
const lastInferenceAt = new Map();

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, device_id, scene_name, telemetry } = req.body;

      if (!session_id || !device_id || !telemetry) {
        return res.status(400).json({
          error: "Missing required telemetry fields",
        });
      }

      const now = Date.now();
      const lastRun = lastInferenceAt.get(session_id);

      // =========================
      // INTERVAL GATE (N seconds)
      // =========================
      if (lastRun && now - lastRun < detectionConfig.INFERENCE_INTERVAL_MS) {
        return res.json({
          status: "telemetry_received_inference_skipped",
        });
      }

      // =========================
      // CALL CNN-LSTM INFERENCE
      // =========================
      let inference;
      try {
        inference = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          { session_id, telemetry },
          {
            timeout: 90_000,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
        if (err.response?.status === 429) {
          console.warn("⚠️ Inference rate-limited — backing off");
          lastInferenceAt.set(
            session_id,
            now + detectionConfig.INFERENCE_BACKOFF_MS,
          );
          return res.json({ status: "inference_backoff_active" });
        }
        throw err;
      }

      lastInferenceAt.set(session_id, now);

      const {
        prediction = "--",
        confidence = 0,
        severity = "low",
      } = inference.data;

      // =========================
      // IF MODEL FLAGS SUSPICIOUS
      // =========================
      if (prediction !== "--") {
        // reuse controller logic
        await createCheatingLog(
          {
            body: {
              session_id,
              event_type: prediction,
              severity,
              confidence_level: confidence,
              details: {
                device_id,
                scene_name,
                telemetry_summary: telemetry,
              },
            },
            app: { get: () => io },
          },
          {
            status: () => ({ json: () => {} }),
            json: () => {},
          },
        );
      }

      return res.json({
        status: "ok",
        prediction,
        confidence,
        severity,
      });
    } catch (err) {
      console.error("❌ Telemetry processing error:", err.message);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
