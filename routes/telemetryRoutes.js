import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

const lastInferenceRun = new Map();
const INFERENCE_MIN_INTERVAL_MS = 15000;
const BACKOFF_MS = 60000;

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    console.error("===== TELEMETRY ENTRY =====");

    try {
      const { session_id, device_id, scene_name, telemetry } = req.body;

      console.error("session_id:", session_id);
      console.error("telemetry exists:", !!telemetry);
      console.error("telemetry is array:", Array.isArray(telemetry));
      console.error("telemetry length:", telemetry?.length);
      console.error("first frame length:", telemetry?.[0]?.length);

      if (!session_id || !telemetry || !Array.isArray(telemetry)) {
        console.error("❌ INVALID TELEMETRY STRUCTURE");
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      const now = Date.now();
      const lastRun = lastInferenceRun.get(session_id);

      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        console.warn("⏳ Inference skipped (cooldown)");
        return res.json({ status: "skipped" });
      }

      console.error("➡️ CALLING INFERENCE SERVICE");

      let inferenceResponse;
      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          { sequence: telemetry },
          { timeout: 120000 },
        );
      } catch (aiErr) {
        console.error("🔥 INFERENCE SERVICE ERROR");
        console.error(aiErr.response?.data || aiErr.message);
        throw aiErr;
      }

      console.error("✅ INFERENCE RESPONSE:", inferenceResponse.data);
      lastInferenceRun.set(session_id, now);

      const { cheating_score, label } = inferenceResponse.data;

      io.emit("live_status", {
        session_id,
        prediction: label,
        confidence: cheating_score,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        status: "ok",
        cheating_score,
        label,
      });
    } catch (err) {
      console.error("💥 TELEMETRY CRASH STACK TRACE");
      console.error(err.stack || err);

      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
