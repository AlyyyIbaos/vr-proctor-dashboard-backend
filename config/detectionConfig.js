const detectionConfig = {
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
  INFERENCE_INTERVAL_MS: 60000,
  INFERENCE_BACKOFF_MS: 120000,

  // =========================
  // RISK MAPPING
  // =========================
  SEVERITY_RISK_MAP: {
    low: "Low",
    medium: "Medium",
    high: "High",
  },

  // =========================
  // STATISTICAL DEVIATION THRESHOLDS
  // =========================
  Z_SCORE_THRESHOLDS: {
    SUSPICIOUS: 1.5,
    CHEATING: 2.5,
  },

  // =========================
  // TEMPORAL DECISION LOGIC
  // =========================
  TEMPORAL_RULES: {
    CHEATING_MIN_CONSECUTIVE: 3,
    CHEATING_WINDOW_MS: 180000, // 3 minutes
    SUSPICIOUS_PERSIST_MS: 15000,
    NORMAL_RECOVERY_COOLDOWN_MS: 120000,
  },

  // =========================
  // BASELINE + WINDOW SETTINGS
  // =========================
  STATISTICAL_WINDOW: {
    SCORE_WINDOW_SIZE: 5,
    BASELINE_SAMPLES: 5,
  },
};

export default detectionConfig;
