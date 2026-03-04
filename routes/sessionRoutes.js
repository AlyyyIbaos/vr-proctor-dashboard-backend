import express from "express";
import supabase from "../config/supabaseClient.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";
import crypto from "crypto";

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

    const { data: exam } = await supabase
      .from("exams")
      .select("*")
      .eq("status", "live")
      .limit(1)
      .single();

    if (!exam) {
      return res.status(400).json({
        error: "No live exam available",
      });
    }

    const { data: examinee } = await supabase
      .from("examinees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!examinee) {
      return res.status(400).json({
        error: "Examinee profile not found",
      });
    }

    const vrToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const { data: session, error } = await supabase
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
          vr_session_token: vrToken,
          vr_token_expires_at: expiresAt,
        },
      ])
      .select("*, exams(*)")
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: "Failed to create session",
      });
    }

    return res.json({
      ...session,
      vr_session_token: vrToken,
    });
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    return res.status(500).json({
      error: "Server error starting session",
    });
  }
});

/*
==================================================
GET ACTIVE SESSION FOR LOGGED-IN STUDENT
GET /api/sessions/active
==================================================
*/
router.get("/active", requireVerifiedSession, async (req, res) => {
  try {
    const userId = req.auth.user_id;

    const { data: examinee } = await supabase
      .from("examinees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!examinee) return res.json([]);

    const { data: sessions } = await supabase
      .from("sessions")
      .select("*, exams(*)")
      .eq("examinee_id", examinee.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    return res.json(sessions || []);
  } catch (err) {
    console.error("GET ACTIVE SESSION ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/*
==================================================
GET SESSION HISTORY
GET /api/sessions/student/history
==================================================
*/
router.get("/student/history", requireVerifiedSession, async (req, res) => {
  try {
    const userId = req.auth.user_id;

    const { data: examinee } = await supabase
      .from("examinees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!examinee) return res.json([]);

    const { data: sessions } = await supabase
      .from("sessions")
      .select("*, exams(title)")
      .eq("examinee_id", examinee.id)
      .neq("status", "active")
      .order("created_at", { ascending: false });

    return res.json(
      (sessions || []).map((s) => ({
        ...s,
        exam_title: s.exams?.title || "Unknown Exam",
      })),
    );
  } catch (err) {
    console.error("GET HISTORY ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
