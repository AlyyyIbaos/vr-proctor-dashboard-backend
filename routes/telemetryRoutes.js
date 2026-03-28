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
  VR TELEMETRY (SIMPLIFIED — NO VR TOKEN)
  ==================================================
  */
  router.post("/telemetry", async (req, res) => {
    try {
      const { session_id, question_index, window_index, window } = req.body;

      if (!session_id || !window) {
        return res.status(400).json({ error: "Invalid telemetry payload" });
      }

      // =========================
      // VALIDATE SESSION ONLY
      // =========================
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", session_id)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      if (session.status !== "active") {
        return res.status(403).json({ error: "Session not active" });
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
            source: "ai",
          },
        ]);

      if (insertError) {
        console.error("❌ SUPABASE INSERT ERROR:", insertError);
      }

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
      const payload = {
        session_id,
        prob_cheat,
        pred_raw,
        cat_active,
        decision_mode,
        question_index,
        timestamp: new Date().toISOString(),
      };

      console.log("📡 LIVE STATUS EMIT:", {
        session_id,
        question_index,
        prob_cheat,
      });

      io.to(session_id).emit("live_status", payload);
      io.to(session_id).emit("new_alert", {
        session_id,
        event_type: "behavioral", // ✅ FIXED
        severity:
          prob_cheat > 0.8 ? "high" : prob_cheat > 0.5 ? "medium" : "low",
        confidence_level: prob_cheat,
        detected_at: new Date().toISOString(),
        question_index, // ✅ ADD THIS
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
