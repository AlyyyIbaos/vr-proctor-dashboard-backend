import supabase from "../config/supabaseClient.js";

export const getLiveExams = async (req, res) => {
  try {
    const { data: exams, error } = await supabase
      .from("exams")
      .select("id,title")
      .eq("status", ["live", "scheduled"]);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch exams" });
    }

    for (const exam of exams) {
      const { data: sessions } = await supabase
        .from("sessions")
        .select(
          `
          id,
          status,
          score,
          max_score,
          examinees (
            full_name,
            program,
            year_level
          )
        `,
        )
        .eq("exam_id", exam.id);

      exam.sessions = (sessions || []).map((s) => ({
        id: s.id,
        status: s.status,
        score: s.score,
        max_score: s.max_score,
        examinee_name: s.examinees?.full_name ?? "Examinee",
        course: s.examinees?.program ?? "Program",
        year_level: s.examinees?.year_level ?? "Year",
      }));
    }

    res.json(exams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
