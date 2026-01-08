import supabase from "../config/supabaseClient.js";

/**
 * CREATE a detection alert
 * Used by: VR system / Socket.IO simulation
 */
export const createDetection = async (req, res) => {
  const {
    session_id,
    behavior_type,
    description,
    confidence,
    severity,
  } = req.body;

  if (!session_id || !behavior_type || !confidence || !severity) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // 1️⃣ Insert alert
  const { error: alertError } = await supabase
    .from("alerts")
    .insert([
      {
        session_id,
        behavior_type,
        description,
        confidence,
        severity,
      },
    ]);

  if (alertError) {
    console.error(alertError);
    return res.status(500).json({ error: "Failed to save alert" });
  }

  // 2️⃣ Update session risk level (simple rule)
  let risk_level = "low";
  if (severity === "medium") risk_level = "medium";
  if (severity === "high") risk_level = "high";

  const { error: sessionError } = await supabase
    .from("sessions")
    .update({ risk_level })
    .eq("id", session_id);

  if (sessionError) {
    console.error(sessionError);
    return res.status(500).json({ error: "Failed to update session risk" });
  }

  res.status(201).json({
    message: "Detection alert created",
    risk_level,
  });
};

/**
 * GET all alerts for a session
 * Used in: ExamineePage
 */
export const getDetectionsBySession = async (req, res) => {
  const { sessionId } = req.params;

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("session_id", sessionId)
    .order("detected_at", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch alerts" });
  }

  res.json(data);
};
