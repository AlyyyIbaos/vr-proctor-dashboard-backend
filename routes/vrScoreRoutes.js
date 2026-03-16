import express from "express";
import supabase from "../config/supabaseClient.js";

export default function vrScoreRoutes(io) {
  const router = express.Router();

  /*
==================================================
VR → Backend: Submit Exam Score
==================================================
*/

  router.post("/score", async (req, res) => {
    const { session_id, device_id, score, max_score, submitted_at } = req.body;

    console.log("📥 VR SCORE PAYLOAD:", req.body);

    if (!session_id) {
      return res.status(400).json({ error: "session_id is required" });
    }

    if (score == null || max_score == null) {
      return res
        .status(400)
        .json({ error: "score and max_score are required" });
    }

    try {
      /*
    ======================================
    VERIFY SESSION
    ======================================
    */

      const { data: session } = await supabase
        .from("sessions")
        .select("id")
        .eq("id", session_id)
        .single();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      /*
    ======================================
    SAVE SCORE
    ======================================
    */

      await supabase
        .from("sessions")
        .update({
          score,
          max_score,
          ended_at: submitted_at || new Date().toISOString(),
        })
        .eq("id", session_id);

      /*
    ======================================
    FETCH INFERENCE LOGS
    ======================================
    */

      const { data: logs } = await supabase
        .from("inference_logs")
        .select("*")
        .eq("session_id", session_id);

      if (!logs || logs.length === 0) {
        console.warn("⚠ No inference logs found");
      }

      /*
    ======================================
    GROUP WINDOWS BY QUESTION
    ======================================
    */

      const grouped = {};
      let prob_sum = 0;

      logs.forEach((log) => {
        const q = log.question_index;

        if (!grouped[q]) {
          grouped[q] = {
            flagged: 0,
            total: 0,
          };
        }

        grouped[q].total += 1;
        prob_sum += log.prob_cheat ?? 0;

        if (log.pred_raw === 1 || log.cat_active === 1) {
          grouped[q].flagged += 1;
        }
      });

      /*
    ======================================
    QUESTION VERDICTS
    ======================================
    */

      let suspicious_questions = 0;

      Object.values(grouped).forEach((q) => {
        if (q.flagged >= 3) {
          suspicious_questions += 1;
        }
      });

      /*
    ======================================
    SESSION VERDICT
    ======================================
    */

      const final_verdict = suspicious_questions >= 2 ? "suspicious" : "normal";

      const overall_probability = logs.length > 0 ? prob_sum / logs.length : 0;

      /*
    ======================================
    UPDATE SESSION FINAL DECISION
    ======================================
    */

      await supabase
        .from("sessions")
        .update({
          final_label: final_verdict,
          final_confidence: overall_probability,
          decision_at: new Date().toISOString(),
          status: final_verdict === "suspicious" ? "flagged" : "completed",
        })
        .eq("id", session_id);

      /*
    ======================================
    SOCKET.IO: PUSH FINAL RESULT
    ======================================
    */

      io.to(session_id).emit("session_finalized", {
        session_id,
        score,
        max_score,
        final_verdict,
        overall_probability,
      });

      console.log("🏁 SESSION FINALIZED:", {
        session_id,
        final_verdict,
        overall_probability,
      });

      return res.json({
        status: "ok",
        score,
        max_score,
        final_verdict,
        overall_probability,
      });
    } catch (err) {
      console.error("💥 VR SCORE ERROR:", err);

      return res.status(500).json({
        error: "Failed to finalize session",
      });
    }
  });

  return router;
}
