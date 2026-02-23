import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

export default function telemetryRoutes(io) {
  const router = express.Router();

  // =========================
  // VR CONNECTION TEST
  // =========================
  router.post("/ping", (req, res) => {
    console.log("📡 VR Ping received:", req.body);
    return res.json({
      status: "pong",
      message: "VR backend reachable",
      timestamp: new Date().toISOString(),
    });
  });

  // =========================
  // VR TELEMETRY → FASTAPI → SUPABASE
  // =========================
  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, question_index, window_index, window } = req.body;

      if (!session_id || !window) {
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      console.log("📥 Telemetry received:", {
        session_id,
        question_index,
        window_index,
        window_length: window.length,
      });

      // =========================
      // CALL FASTAPI
      // =========================
      const inferenceResponse = await axios.post(
        `${process.env.INFERENCE_SERVICE_URL}/infer_window`,
        {
          session_id,
          window,
        },
        { timeout: 120000 },
      );

      const data = inferenceResponse.data;

      const {
        prob_cheat,
        pred_raw,
        cat_active,
        cat_transition,
        model_latency_ms,
        total_latency_ms,
      } = data;

      const decision_mode = process.env.USE_CAT === "true" ? "cat" : "fixed";

      console.log("🧠 Inference result:", {
        prob_cheat,
        pred_raw,
        cat_active,
        decision_mode,
      });

      // =========================
      // LOG EVERY WINDOW
      // =========================
      const { error: insertError } = await supabase
        .from("inference_logs")
        .insert([
          {
            session_id,
            question_index,
            window_index,
            prob_cheat,
            pred_raw,
            cat_active,
            cat_transition,
            decision_mode,
            model_latency_ms,
            total_latency_ms,
          },
        ]);

      if (insertError) {
        console.error("❌ Supabase insert error:", insertError);
      } else {
        console.log("✅ Inference logged to Supabase");
      }

      // =========================
      // ESCALATE SESSION RISK
      // =========================
      if (cat_active === 1) {
        const { error: updateError } = await supabase
          .from("sessions")
          .update({ risk_level: "high" })
          .eq("id", session_id);

        if (updateError) {
          console.error("⚠️ Risk escalation failed:", updateError);
        }
      }

      // =========================
      // EMIT LIVE STATUS
      // =========================
      io.emit("live_status", {
        session_id,
        prob_cheat,
        pred_raw,
        cat_active,
        cat_transition,
        decision_mode,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        status: "ok",
        prob_cheat,
        pred_raw,
        cat_active,
        cat_transition,
        decision_mode,
      });
    } catch (err) {
      console.error("💥 TELEMETRY ERROR:", err.response?.data || err.message);
      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
