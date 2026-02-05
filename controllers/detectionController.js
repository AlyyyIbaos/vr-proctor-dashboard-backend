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
  // VALIDATION (STRICT)
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
  // UPDATE SESSION RISK LEVEL
  // =========================
  const risk_level = detectionConfig.SEVERITY_RISK_MAP[severity] || "Low";

  const { error: sessionError } = await supabase
    .from("sessions")
    .update({ risk_level })
    .eq("id", session_id);

  if (sessionError) {
    console.error(sessionError);
    return res.status(500).json({
      error: "Failed to update session risk level",
    });
  }

  // =========================
  // SOCKET.IO — LIVE ALERT
  // =========================
  const io = req.app.get("io");
  if (io) {
    io.to(session_id).emit("new_alert", data);
  } else {
    console.warn("⚠️ Socket.IO instance not found on app");
  }

  res.status(201).json({
    message: "Cheating log created",
    risk_level,
    log: data,
  });
};

/**
 * GET cheating logs by session
 * Used by: Proctor / dashboard
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
