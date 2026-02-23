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
    const userId = req.auth.user_id;

    // 1️⃣ Find LIVE exam
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("status", "live")
      .limit(1)
      .single();

    if (examError || !exam) {
      return res.status(400).json({
        error: "No live exam available",
      });
    }

    // 2️⃣ Find examinee record for this user
    const { data: examinee, error: examineeError } = await supabase
      .from("examinees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (examineeError || !examinee) {
      console.error("EXAMINEE NOT FOUND:", examineeError);
      return res.status(400).json({
        error: "Examinee profile not found",
      });
    }

    // 3️⃣ Create session using examinee.id
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert([
        {
          exam_id: exam.id,
          examinee_id: examinee.id,
          status: "active",
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
    const userId = req.auth.user_id;

    // Find examinee first
    const { data: examinee } = await supabase
      .from("examinees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!examinee) {
      return res.json(null);
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .select("*, exams(*)")
      .eq("examinee_id", examinee.id)
      .eq("status", "active")
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
