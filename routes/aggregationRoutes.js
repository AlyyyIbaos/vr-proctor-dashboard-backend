import express from "express";
import supabase from "../config/supabaseClient.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/:id/behavioral-report",
  requireVerifiedSession,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id, role } = req.auth;

      if (role !== "student") {
        return res.status(403).json({ error: "Access denied" });
      }

      // Ensure session belongs to student
      const { data: session } = await supabase
        .from("sessions")
        .select("examinee_id")
        .eq("id", id)
        .single();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { data: examinee } = await supabase
        .from("examinees")
        .select("id")
        .eq("user_id", user_id)
        .single();

      if (!examinee || examinee.id !== session.examinee_id) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const { data: logs, error } = await supabase
        .from("inference_logs")
        .select("*")
        .eq("session_id", id)
        .order("question_index", { ascending: true })
        .order("window_index", { ascending: true });

      if (error) {
        return res.status(500).json({ error: "Failed to fetch logs" });
      }

      if (!logs || logs.length === 0) {
        return res.json([]);
      }

      const grouped = {};

      logs.forEach((log) => {
        const q = log.question_index;

        if (!grouped[q]) {
          grouped[q] = {
            question_index: q,
            total_windows: 0,
            flagged_windows: 0,
            prob_sum: 0,
            decision_mode: log.decision_mode,
            windows: [],
          };
        }

        grouped[q].total_windows += 1;
        grouped[q].prob_sum += log.prob_cheat ?? 0;

        if (log.pred_raw === 1 || log.cat_active === 1) {
          grouped[q].flagged_windows += 1;
        }

        grouped[q].windows.push({
          window_index: log.window_index,
          prob_cheat: log.prob_cheat,
          pred_raw: log.pred_raw,
          cat_active: log.cat_active,
          cat_transition: log.cat_transition,
          decision_mode: log.decision_mode,
        });
      });

      const result = Object.values(grouped).map((q) => {
        const avg_probability =
          q.total_windows > 0 ? q.prob_sum / q.total_windows : 0;

        const final_label = q.flagged_windows >= 3 ? "cheating" : "normal";

        return {
          question_index: q.question_index,
          total_windows: q.total_windows,
          flagged_windows: q.flagged_windows,
          avg_probability,
          decision_mode: q.decision_mode,
          final_label,
          windows: q.windows,
        };
      });

      res.json(result);
    } catch (err) {
      console.error("BEHAVIORAL REPORT ERROR:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  },
);
// ==============================
// DEBUG: CHECK INFERENCE LOG COUNT
// ==============================
router.get("/debug/inference-count", async (req, res) => {
  try {
    const { data, error } = await supabase.from("inference_logs").select("*");

    if (error) {
      return res.status(500).json({ error });
    }

    return res.json({
      count: data.length,
      sample: data.slice(0, 3), // show first 3 rows
    });
  } catch (err) {
    return res.status(500).json({ error: "Debug failed" });
  }
});
export default router;
