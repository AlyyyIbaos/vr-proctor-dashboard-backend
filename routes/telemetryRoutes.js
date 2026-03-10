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
  VR TELEMETRY
  ==================================================
  */

  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, question_index, window_index, window } = req.body;

      if (!session_id || !window) {
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      const { data: session } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", session_id)
        .single();

      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      if (session.status !== "active") {
        return res.status(403).json({ error: "Session not active" });
      }

      let normalizedWindow = window;

      if (window.length > 120) normalizedWindow = window.slice(0, 120);

      if (window.length < 120) {
        return res.status(400).json({
          error: `window must have 120 rows (got ${window.length})`,
        });
      }

      /*
      =========================
      CALL AI INFERENCE
      =========================
      */

      console.log(
        "🚀 Calling inference:",
        `${process.env.INFERENCE_SERVICE_URL}/infer_window`,
      );

      const inferenceResponse = await axios.post(
        `${process.env.INFERENCE_SERVICE_URL}/infer_window`,
        {
          session_id,
          window: normalizedWindow,
        },
      );

      console.log("🧠 Inference result:", inferenceResponse.data);

      const { prob_cheat, pred_raw, cat_active } = inferenceResponse.data;

      /*
      =========================
      STORE INFERENCE LOG
      =========================
      */

      await supabase.from("inference_logs").insert([
        {
          session_id,
          question_index,
          window_index,
          prob_cheat,
          pred_raw,
        },
      ]);

      /*
      =========================
      EVENT TYPE
      =========================
      */

      let severity = "low";

      if (cat_active === 1) severity = "high";
      else if (prob_cheat > 0.4) severity = "medium";

      /*
      =========================
      SOCKET ALERT
      =========================
      */

      const detected_at = new Date().toISOString();

      io.to(session_id).emit("new_alert", {
        session_id,
        event_type: "behavioral",
        severity,
        confidence_level: prob_cheat,
        question_index,
        detected_at,
      });

      /*
      =========================
      LIVE AI PROBABILITY
      =========================
      */

      io.to(session_id).emit("live_status", {
        session_id,
        prob_cheat,
      });

      return res.json({
        status: "ok",
        prob_cheat,
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
