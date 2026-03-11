import express from "express";
import { getLiveExams } from "../controllers/examController.js";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

/*
==================================================
GET LIVE EXAMS FOR PROCTOR DASHBOARD
GET /api/exams/live
==================================================
*/

router.get("/live", getLiveExams);

/*
==================================================
ADD QUESTION TO AN EXAM
POST /api/exams/admin/:examId/questions
==================================================
*/

router.post("/admin/:examId/questions", async (req, res) => {
  const { examId } = req.params;

  const {
    question_index,
    question_type,
    question_text,
    time_limit,
    correct_answer,
    choices,
  } = req.body;

  try {
    const { data: question, error } = await supabase
      .from("questions")
      .insert([
        {
          exam_id: examId,
          question_index,
          question_type,
          question_text,
          time_limit,
          correct_answer,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    if (choices && choices.length > 0) {
      const choiceRows = choices.map((c) => ({
        question_id: question.id,
        label: c.label,
        choice_text: c.text,
      }));

      const { error: choiceError } = await supabase
        .from("choices")
        .insert(choiceRows);

      if (choiceError) throw choiceError;
    }

    res.json(question);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add question" });
  }
});

/*
==================================================
VR FETCH EXAM + QUESTIONS
GET /api/exams/:examId
==================================================
*/

router.get("/:examId", async (req, res) => {
  const { examId } = req.params;

  try {
    const { data: exam } = await supabase
      .from("exams")
      .select("*")
      .eq("id", examId)
      .single();

    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .eq("exam_id", examId)
      .order("question_index");

    const formattedQuestions = [];

    for (const q of questions) {
      const { data: choices } = await supabase
        .from("choices")
        .select("*")
        .eq("question_id", q.id);

      formattedQuestions.push({
        question_id: q.id,
        question_index: q.question_index,
        type: q.question_type,
        text: q.question_text,
        time_limit: q.time_limit,
        choices: (choices || []).map((c) => ({
          label: c.label,
          text: c.choice_text,
        })),
      });
    }

    res.json({
      exam_id: exam.id,
      title: exam.title,
      duration: exam.duration_minutes,
      questions: formattedQuestions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch exam" });
  }
});

export default router;
