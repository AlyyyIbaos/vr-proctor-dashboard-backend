import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

// =========================
// INFERENCE CONTROL
// =========================
const lastInferenceRun = new Map(); // session_id → timestamp
const sessionStartTime = new Map(); // session_id → first seen time

const WARMUP_MS = 5000; // 🔥 first 5 seconds = skip inference
const INFERENCE_MIN_INTERVAL_MS = 15000;
const BACKOFF_MS = 60000;

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    console.error("===== TELEMETRY ENTRY =====");

    try {
      const { session_id, device_id, scene_name, telemetry } = req.body;

      // ---------- BASIC DEBUG ----------
      console.error("session_id:", session_id);
      console.error("telemetry exists:", !!telemetry);
      console.error("telemetry is array:", Array.isArray(telemetry));
      console.error("telemetry length:", telemetry?.length);
      console.error("first frame length:", telemetry?.[0]?.length);

      // ---------- VALIDATION ----------
      if (
        !session_id ||
        !telemetry ||
        !Array.isArray(telemetry) ||
        telemetry.length !== 60 ||
        !Array.isArray(telemetry[0]) ||
        telemetry[0].length !== 12
      ) {
        console.error("❌ INVALID TELEMETRY STRUCTURE");
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      const now = Date.now();

      // ---------- SESSION START (WARM-UP) ----------
      if (!sessionStartTime.has(session_id)) {
        sessionStartTime.set(session_id, now);
        console.warn("🟡 New session detected — starting warm-up");
      }

      const elapsed = now - sessionStartTime.get(session_id);

      if (elapsed < WARMUP_MS) {
        console.warn(
          `⏳ Warm-up active (${Math.floor(elapsed)}ms) — inference skipped`,
        );

        io.emit("live_status", {
          session_id,
          prediction: "warming_up",
          confidence: 0,
          timestamp: new Date().toISOString(),
        });

        return res.json({
          status: "skipped",
          reason: "warmup",
        });
      }

      // ---------- COOLDOWN ----------
      const lastRun = lastInferenceRun.get(session_id);
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        console.warn("⏳ Inference skipped (cooldown)");

        return res.json({
          status: "skipped",
          reason: "cooldown",
        });
      }

      // ---------- CALL INFERENCE SERVICE ----------
      console.error("➡️ CALLING INFERENCE SERVICE");

      let inferenceResponse;
      try {
        inferenceResponse = await axios.post(
          `${process.env.INFERENCE_SERVICE_URL}/predict`,
          {
            session_id,
            sequence: telemetry,
          },
          { timeout: 120000 },
        );
      } catch (aiErr) {
        console.error("🔥 INFERENCE SERVICE ERROR");
        console.error(aiErr.response?.data || aiErr.message);
        throw aiErr;
      }

      lastInferenceRun.set(session_id, now);

      console.error("✅ INFERENCE RESPONSE:", inferenceResponse.data);

      const { cheating_score = 0, label = "normal" } =
        inferenceResponse.data || {};

      // ---------- EMIT LIVE STATUS ----------
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
