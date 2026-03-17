import express from "express";
import supabase from "../config/supabaseClient.js";

export default function vrScoreRoutes(io) {
  const router = express.Router();

  /**
   * VR → Backend: submit exam score
   */
  router.post("/score", async (req, res) => {
    const { session_id, device_id, score, max_score, submitted_at } = req.body;

    // Basic validation (no auth yet)
    if (!session_id || score == null || max_score == null) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    try {
      // ==============================
      // UPDATE SESSION SCORE
      // ==============================
      const { error } = await supabase
        .from("sessions")
        .update({
          score,
          max_score,
          ended_at: submitted_at || new Date().toISOString(),
        })
        .eq("id", session_id);

      if (error) throw error;

      console.log("📊 VR SCORE RECEIVED:", {
        session_id,
        device_id,
        score,
        max_score,
      });

      // ==============================
      // FINAL VERDICT COMPUTATION
      // ==============================

      // 1. Fetch inference logs
      const { data: logs, error: logsError } = await supabase
        .from("inference_logs")
        .select("*")
        .eq("session_id", session_id);

      if (logsError) {
        console.error("❌ Failed to fetch inference logs:", logsError);
      }

      // 2. Group logs by question
      const questionMap = {};

      for (const log of logs || []) {
        const q = log.question_index ?? 0;

        if (!questionMap[q]) {
          questionMap[q] = {
            total: 0,
            suspicious: 0,
          };
        }

        questionMap[q].total += 1;

        if (log.prob_cheat > 0.5) {
          questionMap[q].suspicious += 1;
        }
      }

      // 3. Compute question verdicts
      const questionSummary = [];
      let suspiciousQuestions = 0;

      for (const q in questionMap) {
        const { suspicious } = questionMap[q];

        const verdict = suspicious >= 3 ? "suspicious" : "normal";

        if (verdict === "suspicious") {
          suspiciousQuestions += 1;
        }

        questionSummary.push({
          question: Number(q),
          verdict,
        });
      }

      // 4. Session verdict
      const final_verdict = suspiciousQuestions >= 2 ? "cheating" : "normal";

      // 5. Overall probability
      const totalProb =
        logs?.reduce((acc, l) => acc + (l.prob_cheat || 0), 0) || 0;

      const overall_probability =
        logs?.length > 0 ? totalProb / logs.length : 0;

      // ==============================
      // EMIT FINAL RESULT (REAL-TIME)
      // ==============================
      console.log("📡 Emitting session_finalized to:", session_id);

      io.to(session_id).emit("session_finalized", {
        session_id,
        final_verdict,
        overall_probability,
        score,
        max_score,
        question_summary: questionSummary,
      });

      console.log("🏁 SESSION FINALIZED:", {
        session_id,
        final_verdict,
        overall_probability,
      });

      // ==============================
      // RESPONSE
      // ==============================
      res.json({
        status: "ok",
        message: "Score submitted successfully",
      });
    } catch (err) {
      console.error("VR SCORE ERROR:", err);
      res.status(500).json({ error: "Failed to save score" });
    }
  });

  return router;
}
