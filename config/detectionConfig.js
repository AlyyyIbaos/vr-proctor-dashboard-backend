export default {
  // =========================
  // HEURISTIC SIGNAL BOUNDS
  // (supporting, NOT decision-making)
  // =========================
  HEAD_YAW_THRESHOLD_DEG: 45,
  HEAD_PITCH_THRESHOLD_DEG: 40,
  HAND_MOVEMENT_THRESHOLD: 1.5,
  VOICE_ACTIVITY_THRESHOLD: 0.5,

  // =========================
  // INFERENCE SCHEDULING
  // =========================
  INFERENCE_INTERVAL_MS: 60_000, // 🔥 every 60 seconds
  INFERENCE_BACKOFF_MS: 120_000, // 🔒 2 min backoff on 429

  // =========================
  // RISK MAPPING
  // =========================
  SEVERITY_RISK_MAP: {
    low: "Low",
    medium: "Medium",
    high: "High",
  },
};
