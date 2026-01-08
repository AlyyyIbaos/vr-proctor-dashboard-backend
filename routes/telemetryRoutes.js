import express from "express";
import CheatingLog from "../models/CheatingLog.js";
import ExamLog from "../models/ExamLog.js";
import Student from "../models/Student.js";

export default function createTelemetryRoutes(io) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    try {
      const { studentId, headRotation, handMovement, voiceLevel, environmentTamper } = req.body;

      // ---------------------------------------------------
      // ⭐ ALWAYS SAVE TELEMETRY AS A LOG (STEP 9.4)
      // ---------------------------------------------------
      await ExamLog.create({
        studentId,
        eventType: "Telemetry Update",
        details: {
          headRotation: headRotation || null,
          handMovement: handMovement || null,
          voiceLevel: voiceLevel || null,
          environmentTamper: environmentTamper || false
        }
      });

      await Student.findOneAndUpdate(
        {studentId},
        {lastSeen: Date.now(), status: "active"},
        {new: true}
      );

      let alerts = [];

      // -----------------------------
      // 1. HEAD MOVEMENT DETECTION
      // -----------------------------
      if (headRotation) {
        const { x, y, z } = headRotation;
        if (Math.abs(y) > 0.8 || Math.abs(x) > 0.8) {
          alerts.push({
            studentId,
            alertType: "Suspicious head movement detected",
            details: { headRotation }
          });
        }
      }

      // -----------------------------
      // 2. HAND MOVEMENT DETECTION
      // -----------------------------
      if (handMovement && handMovement > 0.9) {
        alerts.push({
          studentId,
          alertType: "Unusual hand movement detected",
          details: { handMovement }
        });
      }

      // -----------------------------
      // 3. VOICE DETECTION
      // -----------------------------
      if (voiceLevel && voiceLevel > 0.7) {
        alerts.push({
          studentId,
          alertType: "Voice detected (possible talking)",
          details: { voiceLevel }
        });
      }

      // -----------------------------
      // 4. ENVIRONMENT TAMPERING
      // -----------------------------
      if (environmentTamper === true) {
        alerts.push({
          studentId,
          alertType: "Environment tampering detected (3D object inserted)",
          details: {}
        });
      }

      // -----------------------------
      // SAVE ALL ALERTS TO DATABASE
      // -----------------------------
      for (const alert of alerts) {
        const saved = await CheatingLog.create(alert);

        // Broadcast to dashboard users
        io.emit("cheating-alert", saved);
      }

      res.json({
        message: "Telemetry processed",
        alertsDetected: alerts.length
      });

    } catch (err) {
      console.error("Telemetry error:", err);
      res.status(500).json({ error: "Server Error" });
    }
  });

  return router;
}
