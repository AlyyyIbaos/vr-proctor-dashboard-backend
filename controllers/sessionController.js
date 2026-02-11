import supabase from "../config/supabaseClient.js";

/**
 * CREATE new exam session
 * Used when starting a VR exam
 */
export const createSession = async (req, res) => {
  const { exam_id, examinee_id } = req.body;

  if (!exam_id || !examinee_id) {
    return res.status(400).json({
      error: "exam_id and examinee_id are required",
    });
  }

  try {
    const { data, error } = await supabase
      .from("sessions")
      .insert([
        {
          exam_id,
          examinee_id,
          status: "active",
          risk_level: "Low",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: "Failed to create session",
      });
    }

    res.status(201).json({
      message: "Session created successfully",
      session: data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server error",
    });
  }
};

/**
 * GET all active exam sessions
 * Used in: LiveExamsPage
 */
export const getActiveSessions = async (req, res) => {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      `
      id,
      status,
      risk_level,
      started_at,
      exams (
        id,
        title
      ),
      examinees (
        id,
        full_name
      )
    `,
    )
    .eq("status", "active");

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to fetch sessions",
    });
  }

  res.json(data);
};

/**
 * GET dashboard summary
 * Used in: DashboardPage
 */
export const getDashboardSummary = async (req, res) => {
  const { data, error } = await supabase.from("sessions").select("risk_level");

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to fetch summary",
    });
  }

  const summary = {
    total: data.length,
    low: data.filter((s) => s.risk_level === "Low").length,
    medium: data.filter((s) => s.risk_level === "Medium").length,
    high: data.filter((s) => s.risk_level === "High").length,
  };

  res.json(summary);
};

/**
 * GET single session details with cheating logs
 * Used in: ExamineePage
 */
export const getSessionDetails = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("sessions")
    .select(
      `
      id,
      status,
      risk_level,
      score,
      max_score,
      started_at,
      ended_at,
      final_label,
      final_reason,
      final_confidence,
      decision_at,
      exams (
        title
      ),
      examinees (
        full_name
      ),
      cheating_logs (
        id,
        event_type,
        confidence_level,
        severity,
        detected_at,
        details
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error(error);
    return res.status(404).json({
      error: "Session not found",
    });
  }

  res.json({
    id: data.id,
    status: data.status,
    risk_level: data.risk_level,
    score: data.score,
    max_score: data.max_score,
    started_at: data.started_at,
    ended_at: data.ended_at,
    final_label: data.final_label,
    final_reason: data.final_reason,
    final_confidence: data.final_confidence,
    decision_at: data.decision_at,
    exam_title: data.exams?.title ?? "Exam",
    examinee_name: data.examinees?.full_name ?? "Examinee",
    alerts: data.cheating_logs ?? [],
  });
};
