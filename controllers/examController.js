import supabase from "../config/supabaseClient.js";

export const getLiveExams = async (req, res) => {
  const { data, error } = await supabase
    .from("exams")
    .select(`
      id,
      title,
      sessions (
        id,
        status,
        score,
        max_score,
        examinees (
          full_name
        )
      )
    `)
    .eq("status", "live");

  if (error) {
    console.error("LIVE EXAMS ERROR:", error);
    return res.status(500).json({ error: error.message});
  }

  const normalized = (data || []).map(exam =>({
    id: exam.id,
    title: exam.title,
    sessions: (exam.sessions || []).map(session => ({
      id: session.id,
      status: session.status,
      score: session.score,
      max_score: session.max_score,
      examinee_name: session.examinees?.fullname ?? "Examinee"
    }))
  }));

  res.json(normalized);
};
