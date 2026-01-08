import express from "express";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

// =======================
// CREATE EXAM
// =======================
router.post("/", async (req, res) => {
  try {
    const exam = await Exam.create(req.body);
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: "Failed to create exam" });
  }
});

// =======================
// GET ALL EXAMS
// =======================
router.get("/live", async (req, res) => {
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
    return res.status(500).json({ error: error.message });
  }

  const normalized = (data || []).map(exam => ({
    id: exam.id,
    title: exam.title,
    sessions: (exam.sessions || []).map(session => ({
      id: session.id,
      status: session.status,
      score: session.score,
      max_score: session.max_score,
      examinee_name: session.examinees?.full_name ?? "Examinee"
    }))
  }));

  res.json(normalized);
});

// =======================
// START AN EXAM
// =======================
router.post("/:id/start", async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      {
        status: "ongoing",
        startedAt: new Date()
      },
      { new: true }
    );

    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: "Error starting exam" });
  }
});

// =======================
// END AN EXAM
// =======================
router.post("/:id/end", async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      {
        status: "finished",
        endingAt: new Date()
      },
      { new: true }
    );

    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: "Error ending exam" });
  }
});

export default router;
