import express from "express";
import supabase from "../config/supabaseClient.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
==================================================
START NEW SESSION
POST /api/sessions/start
==================================================
*/
router.post("/start", requireVerifiedSession, async (req, res) => {
  try {
    const studentId = req.auth.user_id;

    // 🔎 1️⃣ Find a LIVE exam (matches your DB constraint)
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("status", "live")
      .limit(1)
      .single();

    if (examError || !exam) {
      console.error("NO LIVE EXAM FOUND:", examError);
      return res.status(400).json({
        error: "No live exam available",
      });
    }

    // 📝 2️⃣ Create a session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert([
        {
          exam_id: exam.id,
          examinee_id: studentId,
          status: "active", // session state
          risk_level: "low",
          score: 0,
          max_score: 0,
          passed: false,
          started_at: new Date().toISOString(),
        },
      ])
      .select("*, exams(*)")
      .single();

    if (sessionError) {
      console.error("SESSION INSERT ERROR:", sessionError);
      return res.status(500).json({
        error: "Failed to create session",
      });
    }

    return res.json(session);
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    return res.status(500).json({
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
router.get("/current", requireVerifiedSession, async (req, res) => {
  try {
    const studentId = req.auth.user_id;

    const { data: session, error } = await supabase
      .from("sessions")
      .select("*, exams(*)")
      .eq("examinee_id", studentId)
      .eq("status", "active") // session must be active
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !session) {
      return res.json(null);
    }

    return res.json(session);
  } catch (err) {
    console.error("GET CURRENT SESSION ERROR:", err);
    return res.status(500).json({
      error: "Failed to fetch current session",
    });
  }
});

export default router;
