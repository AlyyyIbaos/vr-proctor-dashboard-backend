import supabase from "../config/supabaseClient.js";

/**
 * GET all live exam sessions
 * Used in: LiveExamsPage
 */
export const getActiveSessions = async (req, res) => {
  const { data, error } = await supabase
    .from("sessions")
    .select(`
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
    `)
    .eq("status", "live");

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }

  res.json(data);
};

/**
 * GET dashboard summary
 * Used in: DashboardPage
 */
export const getDashboardSummary = async (req, res) => {
  const { data, error } = await supabase
    .from("sessions")
    .select("risk_level");

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch summary" });
  }

  const summary = {
    total: data.length,
    low: data.filter(s => s.risk_level === "low").length,
    medium: data.filter(s => s.risk_level === "medium").length,
    high: data.filter(s => s.risk_level === "high").length,
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
    .select(`
      id,
      status,
      risk_level,
      score,
      max_score,
      started_at,
      ended_at,
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
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error(error);
    return res.status(404).json({ error: "Session not found" });
  }

  res.json({
    id: data.id,
    status: data.status,
    risk_level: data.risk_level,
    score: data.score,
    max_score: data.max_score,
    started_at: data.started_at,
    ended_at: data.ended_at,
    exam_title: data.exams?.title ?? "Exam",
    examinee_name: data.examinees?.full_name ?? "Examinee",
    alerts: data.cheating_logs ?? []
  });
};
