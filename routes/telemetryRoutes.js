import express from "express";
import axios from "axios";
import supabase from "../config/supabaseClient.js";
import detectionConfig from "../config/detectionConfig.js";

export default function telemetryRoutes(io) {
  const router = express.Router();

  /**
   * VR → Backend Telemetry Endpoint
   * Receives batched VR telemetry and forwards it to inference service
   */
  router.post("/telemetry", async (req, res) => {
    try {
      const {
        session_id,
        device_id,
        scene_name,
        telemetry, // expected: { head, hand, voice }
      } = req.body;

      // =========================
      // 1. VALIDATION
      // =========================
      if (!session_id || !device_id || !telemetry) {
        return res.status(400).json({
          error: "Missing required telemetry fields",
        });
      }

      if (!process.env.INFERENCE_SERVICE_URL) {
        console.error("❌ INFERENCE_SERVICE_URL not set");
        return res.status(500).json({
          error: "Inference service not configured",
        });
      }

      // =========================
      // 2. BUILD INFERENCE PAYLOAD
      // (aligns with testInference.js)
      // =========================
      const inferencePayload = {
        session_id,
        telemetry,
      };

      console.log(
        "📡 Sending telemetry to inference:",
        process.env.INFERENCE_SERVICE_URL
      );

      // =========================
      // 3. CALL INFERENCE SERVICE
      // =========================
      const inferenceResponse = await axios.post(
        `${process.env.INFERENCE_SERVICE_URL}/predict`,
        inferencePayload,
        {
          timeout: 90000, // allow Render cold start
          headers: { "Content-Type": "application/json" },
        }
      );

      const {
        prediction = "--",
        confidence = 0,
        severity = "low",
      } = inferenceResponse.data;

      // =========================
      // 4. HANDLE SUSPICIOUS RESULT
      // =========================
      let savedLog = null;

      if (prediction !== "--") {
        // ---- INSERT CHEATING LOG
        const { data, error } = await supabase
          .from("cheating_logs")
          .insert({
            session_id,
            event_type: prediction,
            severity,
            confidence_level: confidence,
            details: JSON.stringify({
              device_id,
              scene_name,
              telemetry_summary: telemetry,
            }),
          })
          .select()
          .single();

        if (error) {
          console.error("❌ Supabase insert error:", error);
          return res.status(500).json({
            error: "Failed to save cheating log",
          });
        }

        savedLog = data;

        // ---- UPDATE SESSION RISK LEVEL
        const risk_level =
          detectionConfig.SEVERITY_RISK_MAP[severity] || "Low";

        const { error: sessionError } = await supabase
          .from("sessions")
          .update({ risk_level })
          .eq("id", session_id);

        if (sessionError) {
          console.error("❌ Failed to update session risk:", sessionError);
        }

        // ---- SOCKET.IO ALERT (REAL-TIME)
        io.emit("new_alert", savedLog);
      }

      // =========================
      // 5. RESPONSE TO VR
      // =========================
      return res.json({
        status: "ok",
        alert_triggered: prediction !== "--",
        prediction,
        confidence,
        severity,
      });
    } catch (error) {
      console.error("❌ VR Telemetry Processing Error");

      // Inference responded with error
      if (error.response) {
        console.error("Inference status:", error.response.status);
        console.error("Inference data:", error.response.data);

        return res.status(502).json({
          error: "Inference service error",
          inference_status: error.response.status,
        });
      }

      // No response (timeout / network)
      if (error.request) {
        console.error("No response from inference service");

        return res.status(502).json({
          error: "No response from inference service",
        });
      }

      // Other error
      console.error("Telemetry error message:", error.message);

      return res.status(500).json({
        error: "Telemetry processing failed",
      });
    }
  });

  return router;
}
