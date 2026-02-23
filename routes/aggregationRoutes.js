// ===============================
// STUDENT BEHAVIORAL REPORT
// ===============================
router.get("/:id/behavioral-report", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: logs, error } = await supabase
      .from("inference_logs")
      .select("*")
      .eq("session_id", id)
      .order("question_index", { ascending: true });

    if (error) {
      console.error(error);
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
      grouped[q].prob_sum += log.prob_cheat;

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
      const avg_probability = q.prob_sum / q.total_windows;

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
    res.status(500).json({
      error: "Failed to generate behavioral report",
    });
  }
});
