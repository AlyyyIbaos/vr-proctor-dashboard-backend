import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

// =========================
// INFERENCE CONTROL
// =========================
const lastInferenceRun = new Map();
const INFERENCE_MIN_INTERVAL_MS = 15000;
const BACKOFF_MS = 60000;
const DEMO_THRESHOLD = 0.3;

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    // =========================
    // 🔍 TELEMETRY DEBUG BLOCK
    // =========================
    console.error("=== TELEMETRY DEBUG ===");
    console.error("headers:", req.headers);
    console.error("body type:", typeof req.body);
    console.error("raw body:", req.body);
    console.error("session_id:", req.body?.session_id);
    console.error("telemetry isArray:", Array.isArray(req.body?.telemetry));
    console.error("telemetry length:", req.body?.telemetry?.length);
    console.error("first frame:", req.body?.telemetry?.[0]);
    console.error(
      "first frame length:",
      Array.isArray(req.body?.telemetry?.[0])
        ? req.body.telemetry[0].length
        : "N/A",
    );
    console.error("=== END TELEMETRY DEBUG ===");

    // =========================
    // VALIDATION
    // =========================
    try {
      const { session_id, telemetry } = req.body;

      if (!session_id || !telemetry || !Array.isArray(telemetry)) {
        return res.status(400).json({
          error: "Invalid telemetry payload",
        });
      }

      const now = Date.now();
      const lastRun = lastInferenceRun.get(session_id);

      // =========================
      // RATE LIMIT
      // =========================
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        return res.json({ status: "cooldown" });
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
            timeout: 60000,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err) {
        if (err.response?.status === 429) {
          lastInferenceRun.set(session_id, now + BACKOFF_MS);
          return res.json({ status: "rate_limited" });
        }
        throw err;
      }

      lastInferenceRun.set(session_id, now);

      // =========================
      // READ CNN-LSTM OUTPUT
      // =========================
      const cheating_score = inferenceResponse.data?.cheating_score ?? 0;
      const label = inferenceResponse.data?.label ?? "normal";

      const isSuspicious = cheating_score >= DEMO_THRESHOLD;

      const severity = isSuspicious
        ? cheating_score >= 0.7
          ? "high"
          : cheating_score >= 0.45
            ? "medium"
            : "low"
        : "low";

      const prediction = isSuspicious ? "cheating behavior" : "normal";

      console.error("🧠 CNN-LSTM RESULT:", {
        cheating_score,
        label,
        prediction,
      });

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
      // SAVE IF SUSPICIOUS
      // =========================
      if (isSuspicious) {
        const { data } = await supabase
          .from("cheating_logs")
          .insert({
            session_id,
            event_type: "cheating behavior",
            severity,
            confidence_level: cheating_score,
            details: JSON.stringify({
              model: "cnn-lstm",
              sequence_length: telemetry.length,
            }),
          })
          .select()
          .single();

        if (data) {
          await supabase
            .from("sessions")
            .update({
              risk_level:
                severity === "high"
                  ? "High"
                  : severity === "medium"
                    ? "Medium"
                    : "Low",
            })
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
      console.error("❌ TELEMETRY ROUTE ERROR:", error);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
