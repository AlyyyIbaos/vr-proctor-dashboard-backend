import express from "express";
import supabase from "../config/supabaseClient.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";
import crypto from "crypto";

const router = express.Router();

/*
==============================================
SESSION CODE GENERATOR
==============================================
*/
function generateSessionCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

/*
==============================================
GENERATE UNIQUE SESSION CODE
==============================================
*/
async function generateUniqueSessionCode() {
  let unique = false;
  let code = null;

  while (!unique) {
    code = generateSessionCode();

    const { data } = await supabase
      .from("sessions")
      .select("id")
      .eq("session_code", code)
      .maybeSingle();

    if (!data) {
      unique = true;
    }
  }

  return code;
}

/*
==================================================
START NEW SESSION
POST /api/sessions/start
==================================================
*/
router.post("/start", requireVerifiedSession, async (req, res) => {
  try {
    const userId = req.auth.user_id;

    /* ===============================
       NEW: READ EXAM ID FROM FRONTEND
    =============================== */

    const { exam_id } = req.body;

    if (!exam_id) {
      return res.status(400).json({
        error: "exam_id is required",
      });
    }

    /* ===============================
       FETCH THAT SPECIFIC EXAM
    =============================== */

    const { data: exam } = await supabase
      .from("exams")
      .select("*")
      .eq("id", exam_id)
      .single();

    if (!exam) {
      return res.status(400).json({
        error: "Selected exam not found",
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

    /*
    ==============================================
    CHECK IF ACTIVE SESSION ALREADY EXISTS
    ==============================================
    */

    const { data: existingSession } = await supabase
      .from("sessions")
      .select("*")
      .eq("examinee_id", examinee.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingSession) {
      return res.json({
        ...existingSession,
        message: "Active session already exists",
      });
    }

    /*
    ==============================================
    CREATE NEW SESSION
    ==============================================
    */

    const vrToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const sessionCode = await generateUniqueSessionCode();

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
          session_code: sessionCode,
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

    /*
    ==========================================
    SOCKET.IO BROADCAST
    ==========================================
    */

    const io = req.app.get("io");

    if (io) {
      io.emit("new_session_started", {
        session_id: session.id,
        session_code: sessionCode,
        exam_id: exam.id,
      });
    }

    return res.json({
      ...session,
      session_code: sessionCode,
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
      .order("started_at", { ascending: false });

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
      .order("started_at", { ascending: false });

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
