import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

// =========================
// SESSION STATE (IN-MEMORY)
// =========================
const lastInferenceRun = new Map();
const lastEmittedLabel = new Map();
const lastPersistentState = new Map();

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/telemetry", async (req, res) => {
    try {
      const {
        session_id,
        telemetry,
        phase = "Exam",
        speech_allowed = false,
        tracking_ok = true,
      } = req.body;

      const now = Date.now();

      // =========================
      // VALIDATION
      // =========================
      if (
        !session_id ||
        !telemetry ||
        telemetry.length !== 60 ||
        telemetry[0].length !== 12
      ) {
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      // =========================
      // LIGHT COOLDOWN (2s)
      // =========================
      const lastRun = lastInferenceRun.get(session_id);
      if (lastRun && now - lastRun < 2000) {
        return res.json({ status: "cooldown" });
      }

      // =========================
      // CALL FASTAPI
      // =========================
      const inferenceResponse = await axios.post(
        `${process.env.INFERENCE_SERVICE_URL}/predict`,
        {
          session_id,
          phase,
          speech_allowed,
          tracking_ok,
          sequence: telemetry,
        },
        { timeout: 120000 },
      );

      lastInferenceRun.set(session_id, now);

      const data = inferenceResponse.data;

      if (data.status !== "ok") {
        return res.json(data);
      }

      // =========================
      // EXTRACT STRUCTURE
      // =========================
      const cheating_score = data.model.cheating_score;
      const final_label = data.decision.final_label;
      const risk_level = data.decision.risk_level?.toLowerCase() || "low";
      const persistent_flag = data.decision.persistent_flag;
      const risk_score = data.decision.risk_score;
      const dynamic_threshold = data.decision.dynamic_threshold;

      const flags = data.explainability.flags || [];
      const reasons = data.explainability.reasons || [];

      const reason_code =
        reasons.length > 0 ? reasons[0] : "context_evaluation";

      // =========================
      // TRANSITION LOGIC ONLY
      // =========================
      if (!lastEmittedLabel.has(session_id)) {
        lastEmittedLabel.set(session_id, null);
      }

      if (!lastPersistentState.has(session_id)) {
        lastPersistentState.set(session_id, false);
      }

      const previousLabel = lastEmittedLabel.get(session_id);
      const previousPersistent = lastPersistentState.get(session_id);

      const labelChanged = previousLabel !== final_label;
      const persistenceActivated =
        persistent_flag === true && previousPersistent !== true;

      if (labelChanged || persistenceActivated) {
        try {
          await supabase.from("proctor_events").insert([
            {
              session_id,
              event_type: final_label,
              reason_code,
              confidence_score: cheating_score,
              risk_score,
              dynamic_threshold,
              persistent_flag,
              flags,
              reasons,
            },
          ]);

          lastEmittedLabel.set(session_id, final_label);
          lastPersistentState.set(session_id, persistent_flag);
        } catch (dbErr) {
          console.error("⚠️ Failed to log proctor event:", dbErr.message);
        }
      }

      // =========================
      // ESCALATE SESSION RISK LEVEL
      // =========================
      const riskPriority = { low: 1, medium: 2, high: 3 };

      try {
        const { data: sessionData } = await supabase
          .from("sessions")
          .select("risk_level")
          .eq("id", session_id)
          .single();

        if (sessionData) {
          const currentRisk = sessionData.risk_level || "low";

          if (riskPriority[risk_level] > riskPriority[currentRisk]) {
            await supabase
              .from("sessions")
              .update({ risk_level })
              .eq("id", session_id);
          }
        }
      } catch (err) {
        console.error("⚠️ Risk escalation failed:", err.message);
      }

      // =========================
      // EMIT TO DASHBOARD
      // =========================
      io.emit("live_status", {
        session_id,
        prediction: final_label,
        confidence: cheating_score,
        risk_level,
        persistent_flag,
        risk_score,
        dynamic_threshold,
        flags,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        status: "ok",
        final_label,
        risk_level,
        persistent_flag,
        risk_score,
        dynamic_threshold,
      });
    } catch (err) {
      console.error("💥 TELEMETRY ERROR:", err);
      return res.status(500).json({ error: "Telemetry processing failed" });
    }
  });

  return router;
}
