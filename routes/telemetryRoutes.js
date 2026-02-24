import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";

export default function telemetryRoutes(io) {
  const router = express.Router();

  router.post("/ping", (req, res) => {
    return res.json({
      status: "pong",
      timestamp: new Date().toISOString(),
    });
  });

  /*
  ==================================================
  VR TELEMETRY WITH SESSION TOKEN VALIDATION
  ==================================================
  */
  router.post("/telemetry", async (req, res) => {
    try {
      const {
        session_id,
        vr_session_token,
        question_index,
        window_index,
        window,
      } = req.body;

      if (!session_id || !vr_session_token || !window) {
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      // =========================
      // VALIDATE SESSION + TOKEN
      // =========================
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("vr_session_token, vr_token_expires_at, status")
        .eq("id", session_id)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      if (session.status !== "active") {
        return res.status(403).json({ error: "Session not active" });
      }

      if (session.vr_session_token !== vr_session_token) {
        return res.status(401).json({ error: "Invalid VR token" });
      }

      if (
        session.vr_token_expires_at &&
        new Date(session.vr_token_expires_at) < new Date()
      ) {
        return res.status(401).json({ error: "VR token expired" });
      }

      // =========================
      // CALL FASTAPI INFERENCE
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

      // =========================
      // LOG WINDOW
      // =========================
      await supabase.from("inference_logs").insert([
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

      // =========================
      // ESCALATE RISK
      // =========================
      if (cat_active === 1) {
        await supabase
          .from("sessions")
          .update({ risk_level: "high" })
          .eq("id", session_id);
      }

      // =========================
      // LIVE EMIT
      // =========================
      io.emit("live_status", {
        session_id,
        prob_cheat,
        pred_raw,
        cat_active,
        decision_mode,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        status: "ok",
        prob_cheat,
        pred_raw,
        cat_active,
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
