import express from "express";
import { getLiveExams } from "../controllers/examController.js";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

/*
==================================================
GET LIVE EXAMS FOR PROCTOR DASHBOARD
==================================================
*/

router.get("/live", getLiveExams);

/*
==================================================
CREATE EXAM
POST /api/exams/admin
==================================================
*/

router.post("/admin", async (req, res) => {
  const { title, subject, duration_minutes } = req.body;

  try {
    const { data, error } = await supabase
      .from("exams")
      .insert([
        {
          title,
          subject,
          duration_minutes,
          status: "scheduled",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create exam" });
  }
});

/*
==================================================
PUBLISH EXAM (READY FOR VR)
PATCH /api/exams/admin/:examId/publish
==================================================
*/

router.patch("/admin/:examId/publish", async (req, res) => {
  const { examId } = req.params;

  try {
    const { data, error } = await supabase
      .from("exams")
      .update({ status: "live" })
      .eq("id", examId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to publish exam" });
  }
});

/*
==================================================
ADD QUESTION TO AN EXAM
==================================================
*/

router.post("/admin/:examId/questions", async (req, res) => {
  const { examId } = req.params;

  const { question_type, question_text, time_limit, correct_answer, choices } =
    req.body;

  try {
    const { data: existing } = await supabase
      .from("questions")
      .select("question_index")
      .eq("exam_id", examId)
      .order("question_index", { ascending: false })
      .limit(1);

    const nextIndex = existing?.length ? existing[0].question_index + 1 : 1;

    const { data: question, error } = await supabase
      .from("questions")
      .insert([
        {
          exam_id: examId,
          question_index: nextIndex,
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
DELETE QUESTION
==================================================
*/

router.delete("/admin/questions/:questionId", async (req, res) => {
  const { questionId } = req.params;

  try {
    await supabase.from("choices").delete().eq("question_id", questionId);

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete question" });
  }
});

/*
==================================================
UPDATE QUESTION
==================================================
*/

router.patch("/admin/questions/:questionId", async (req, res) => {
  const { questionId } = req.params;
  const { question_text } = req.body;

  try {
    const { data, error } = await supabase
      .from("questions")
      .update({ question_text })
      .eq("id", questionId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update question" });
  }
});

/*
==================================================
VR FETCH EXAM + QUESTIONS
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
