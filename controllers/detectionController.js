import supabase from "../config/supabaseClient.js";
import detectionConfig from "../config/detectionConfig.js";

/**
 * CREATE cheating log
 * Used by: VR system (object whitelist, scene tampering)
 */
export const createCheatingLog = async (req, res) => {
  const {
    session_id,
    event_type,
    severity = "low",
    confidence_level,
    details,
  } = req.body;

  // =========================
  // VALIDATION
  // =========================
  if (!session_id || confidence_level === undefined || !details) {
    return res.status(400).json({
      error: "Missing required fields",
    });
  }

  if (confidence_level < 0 || confidence_level > 1) {
    return res.status(400).json({
      error: "confidence_level must be between 0 and 1",
    });
  }

  const allowedEventTypes = [
    "object injection",
    "scene tampering",
    "cheating behavior",
    "--",
  ];

  if (!allowedEventTypes.includes(event_type)) {
    return res.status(400).json({
      error: "Invalid event_type",
    });
  }

  const allowedSeverity = ["low", "medium", "high"];
  if (!allowedSeverity.includes(severity)) {
    return res.status(400).json({
      error: "Invalid severity",
    });
  }

  // =========================
  // INSERT CHEATING LOG
  // =========================
  const { data, error: insertError } = await supabase
    .from("cheating_logs")
    .insert({
      session_id,
      event_type,
      severity,
      confidence_level,
      details,
    })
    .select()
    .single();

  if (insertError) {
    console.error(insertError);
    return res.status(500).json({
      error: "Failed to save cheating log",
    });
  }

  // =========================
  // ESCALATE SESSION RISK
  // =========================
  const riskMap = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const newRisk = severity.toLowerCase();

  const { data: sessionData } = await supabase
    .from("sessions")
    .select("risk_level")
    .eq("id", session_id)
    .single();

  if (sessionData) {
    const currentRisk = sessionData.risk_level || "low";

    if (riskMap[newRisk] > riskMap[currentRisk]) {
      await supabase
        .from("sessions")
        .update({ risk_level: newRisk })
        .eq("id", session_id);
    }
  }

  // =========================
  // SOCKET.IO LIVE ALERT
  // =========================
  const io = req.app.get("io");
  if (io) {
    io.to(session_id).emit("new_alert", data);
  }

  res.status(201).json({
    message: "Cheating log created",
    risk_level: newRisk,
    log: data,
  });
};

/**
 * GET cheating logs by session
 */
export const getCheatingLogsBySession = async (req, res) => {
  const { sessionId } = req.params;

  const { data, error } = await supabase
    .from("cheating_logs")
    .select("*")
    .eq("session_id", sessionId)
    .order("detected_at", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to fetch cheating logs",
    });
  }

  res.json(data);
};

/**
 * FINALIZE SESSION
 * Computes final verdict based on proctor_events
 */
export const finalizeSession = async (req, res) => {
  const { session_id } = req.body;

  if (!session_id) {
    return res.status(400).json({
      error: "session_id is required",
    });
  }

  try {
    // 1️⃣ Fetch monitoring events
    const { data: events, error } = await supabase
      .from("proctor_events")
      .select("*")
      .eq("session_id", session_id);

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: "Failed to fetch proctor events",
      });
    }

    let finalLabel = "normal";
    let finalReason = "no_anomalies_detected";
    let finalConfidence = 0;

    if (events && events.length > 0) {
      const hasCheating = events.some((e) => e.event_type === "cheating");
      const hasSuspicious = events.some((e) => e.event_type === "suspicious");

      if (hasCheating) {
        finalLabel = "cheating";
        finalReason = "cheating_detected_during_session";
      } else if (hasSuspicious) {
        finalLabel = "suspicious";
        finalReason = "suspicious_behavior_observed";
      }

      finalConfidence = Math.max(...events.map((e) => e.confidence_score || 0));
    }

    // Determine final risk
    const finalRisk =
      finalLabel === "cheating"
        ? "high"
        : finalLabel === "suspicious"
          ? "medium"
          : "low";

    // 2️⃣ Update session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        final_label: finalLabel,
        final_reason: finalReason,
        final_confidence: finalConfidence,
        decision_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        risk_level: finalRisk,
        status: finalLabel === "cheating" ? "flagged" : "completed",
      })
      .eq("id", session_id);

    if (updateError) {
      console.error(updateError);
      return res.status(500).json({
        error: "Failed to update session",
      });
    }

    return res.json({
      message: "Session finalized successfully",
      final_label: finalLabel,
      final_confidence: finalConfidence,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Finalization failed",
    });
  }
};
