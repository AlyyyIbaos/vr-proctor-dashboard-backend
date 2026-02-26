import supabase from "../config/supabaseClient.js";

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
    detection_time,
    detection_frame,
    attack_phase,
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

  // 🔒 Ensure session exists
  const { data: sessionExists, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", session_id)
    .single();

  if (sessionError || !sessionExists) {
    return res.status(404).json({
      error: "Session not found",
    });
  }

  // 🔐 Enforce detection_time for runtime security
  if (
    (event_type === "object injection" || event_type === "scene tampering") &&
    detection_time === undefined
  ) {
    return res.status(400).json({
      error: "detection_time required for runtime security events",
    });
  }

  const finalAttackPhase = attack_phase || "runtime";

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
      detection_time,
      detection_frame,
      attack_phase: finalAttackPhase,
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
