import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";
import detectionConfig from "../config/detectionConfig.js";

// =========================
// SESSION STATE (IN-MEMORY)
// =========================
const lastInferenceRun = new Map();
const sessionStartTime = new Map();

const scoreHistory = new Map();
const baselineBuffer = new Map();
const baselineStats = new Map();

const suspiciousSince = new Map();
const cheatingSince = new Map();

const lastEmittedLabel = new Map();
const sessionFinalized = new Map();

// =========================
// CONFIG EXTRACTION
// =========================
const {
  INFERENCE_INTERVAL_MS,
  Z_SCORE_THRESHOLDS,
  TEMPORAL_RULES,
  STATISTICAL_WINDOW,
} = detectionConfig;

const Z_SUSPICIOUS = Z_SCORE_THRESHOLDS.SUSPICIOUS;
const Z_CHEATING = Z_SCORE_THRESHOLDS.CHEATING;

const CHEATING_MIN_CONSECUTIVE = TEMPORAL_RULES.CHEATING_MIN_CONSECUTIVE;

const CHEATING_PERSIST_MS = TEMPORAL_RULES.CHEATING_WINDOW_MS;

const SUSPICIOUS_PERSIST_MS = TEMPORAL_RULES.SUSPICIOUS_PERSIST_MS;

const SCORE_WINDOW_SIZE = STATISTICAL_WINDOW.SCORE_WINDOW_SIZE;

const BASELINE_SAMPLES = STATISTICAL_WINDOW.BASELINE_SAMPLES;

const INFERENCE_MIN_INTERVAL_MS = INFERENCE_INTERVAL_MS;

const WARMUP_MS = 5000;

// =========================
// ROUTER
// =========================
export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, telemetry } = req.body;
      const now = Date.now();

      // ---------- VALIDATION ----------
      if (
        !session_id ||
        !telemetry ||
        telemetry.length !== 60 ||
        telemetry[0].length !== 12
      ) {
        return res.status(400).json({
          error: "Invalid telemetry payload",
        });
      }

      // ---------- SESSION INIT ----------
      if (!sessionStartTime.has(session_id)) {
        sessionStartTime.set(session_id, now);
        scoreHistory.set(session_id, []);
        baselineBuffer.set(session_id, []);
        suspiciousSince.set(session_id, null);
        cheatingSince.set(session_id, null);
        lastEmittedLabel.set(session_id, null);
        sessionFinalized.set(session_id, false);
      }

      // ---------- WARM-UP ----------
      if (now - sessionStartTime.get(session_id) < WARMUP_MS) {
        return res.json({ status: "warming_up" });
      }

      // ---------- COOLDOWN ----------
      const lastRun = lastInferenceRun.get(session_id);
      if (lastRun && now - lastRun < INFERENCE_MIN_INTERVAL_MS) {
        return res.json({ status: "cooldown" });
      }

      // ---------- CALL INFERENCE ----------
      const inferenceResponse = await axios.post(
        `${process.env.INFERENCE_SERVICE_URL}/predict`,
        { session_id, sequence: telemetry },
        { timeout: 120000 },
      );

      lastInferenceRun.set(session_id, now);

      const { cheating_score = 0 } = inferenceResponse.data || {};

      // =========================
      // BASELINE CALIBRATION
      // =========================
      if (!baselineStats.has(session_id)) {
        const buf = baselineBuffer.get(session_id);
        buf.push(cheating_score);

        if (buf.length < BASELINE_SAMPLES) {
          return res.json({
            status: "calibrating",
            collected: buf.length,
          });
        }

        const mean = buf.reduce((a, b) => a + b, 0) / buf.length;

        const variance =
          buf.reduce((sum, x) => sum + (x - mean) ** 2, 0) / buf.length;

        const std = Math.sqrt(variance) || 0.001;

        baselineStats.set(session_id, { mean, std });

        return res.json({ status: "baseline_ready" });
      }

      // =========================
      // Z-SCORE + SLIDING WINDOW
      // =========================
      const { mean, std } = baselineStats.get(session_id);

      const z = (cheating_score - mean) / std;

      const history = scoreHistory.get(session_id);
      history.push(z);

      if (history.length > SCORE_WINDOW_SIZE) {
        history.shift();
      }

      const highCount = history.filter((v) => v >= Z_CHEATING).length;

      // =========================
      // DECISION LOGIC
      // =========================
      let label = "normal";
      let reason = "normal_behavior";

      if (z >= Z_SUSPICIOUS) {
        if (!suspiciousSince.get(session_id)) {
          suspiciousSince.set(session_id, now);
        }

        const suspiciousDuration = now - suspiciousSince.get(session_id);

        // ----- CHEATING CONDITION -----
        if (z >= Z_CHEATING && highCount >= CHEATING_MIN_CONSECUTIVE) {
          if (!cheatingSince.get(session_id)) {
            cheatingSince.set(session_id, now);
          }

          if (now - cheatingSince.get(session_id) >= CHEATING_PERSIST_MS) {
            label = "cheating";
            reason = "consistent_high_deviation";
          } else {
            label = "suspicious";
            reason = "sustained_abnormal_behavior";
          }
        }
        // ----- SUSPICIOUS CONDITION -----
        else if (suspiciousDuration >= SUSPICIOUS_PERSIST_MS) {
          label = "suspicious";
          reason = "sustained_abnormal_behavior";
        } else {
          label = "suspicious";
          reason = "sporadic_anomaly";
        }
      } else {
        // Recovery
        suspiciousSince.set(session_id, null);
        cheatingSince.set(session_id, null);
      }

      // =========================
      // DATABASE WRITES
      // =========================

      const previousLabel = lastEmittedLabel.get(session_id);

      if (previousLabel !== label) {
        try {
          await supabase.from("proctor_events").insert([
            {
              session_id,
              event_type: label,
              reason_code: reason,
              confidence_score: cheating_score,
              z_score: z,
            },
          ]);

          lastEmittedLabel.set(session_id, label);
        } catch (dbErr) {
          console.error("⚠️ Failed to log proctor event:", dbErr.message);
        }
      }

      // ----- FINALIZE SESSION -----
      if (label === "cheating" && !sessionFinalized.get(session_id)) {
        try {
          await supabase
            .from("sessions")
            .update({
              final_label: "cheating",
              final_reason: reason,
              final_confidence: cheating_score,
              decision_at: new Date().toISOString(),
              status: "flagged",
            })
            .eq("id", session_id);

          sessionFinalized.set(session_id, true);
        } catch (dbErr) {
          console.error("⚠️ Failed to finalize session:", dbErr.message);
        }
      }

      // ---------- EMIT ----------
      io.emit("live_status", {
        session_id,
        prediction: label,
        confidence: cheating_score,
        reason,
        z_score: z,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        status: "ok",
        label,
        reason,
        cheating_score,
        z_score: z,
      });
    } catch (err) {
      console.error("💥 TELEMETRY ERROR:", err);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
