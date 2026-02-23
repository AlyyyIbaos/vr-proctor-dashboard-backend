import express from "express";
import supabase from "../config/supabaseClient.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
==================================================
START NEW SESSION (Auto after login)
POST /api/sessions/start
==================================================
*/
router.post("/start", authMiddleware, async (req, res) => {
  try {
    const studentId = req.user.id;

    // 1️⃣ Find an exam (for now pick first active exam)
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("status", "active")
      .limit(1)
      .single();

    if (examError || !exam) {
      return res.status(400).json({
        error: "No active exam available",
      });
    }

    // 2️⃣ Create session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert([
        {
          exam_id: exam.id,
          examinee_id: studentId,
          status: "active",
          risk_level: "low",
          score: 0,
          max_score: 0,
          passed: false,
          started_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (sessionError) {
      console.error(sessionError);
      return res.status(500).json({
        error: "Failed to create session",
      });
    }

    res.json(session);
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    res.status(500).json({
      error: "Server error starting session",
    });
  }
});

/*
==================================================
GET CURRENT ACTIVE SESSION
GET /api/sessions/current
==================================================
*/
router.get("/current", authMiddleware, async (req, res) => {
  try {
    const studentId = req.user.id;

    const { data: session, error } = await supabase
      .from("sessions")
      .select("*, exams(*)")
      .eq("examinee_id", studentId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !session) {
      return res.json(null);
    }

    res.json(session);
  } catch (err) {
    console.error("GET CURRENT SESSION ERROR:", err);
    res.status(500).json({
      error: "Failed to fetch current session",
    });
  }
});

export default router;
