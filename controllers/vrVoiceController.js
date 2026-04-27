export const receiveVoiceVAD = async (req, res) => {
  try {
    const { session_id, question_index, vad_prob, speech_active } = req.body;

    if (!session_id || vad_prob === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const vadValue = Number(vad_prob);
    const vadThreshold = 0.5;

    if (Number.isNaN(vadValue)) {
      return res.status(400).json({
        error: "vad_prob must be a number",
      });
    }

    const isSpeechActive = vadValue > vadThreshold;

    const voiceIdentity = {
      session_id,
      question_index,
      vad_prob: vadValue,
      speech_active: isSpeechActive,
      status: isSpeechActive ? "speech_detected" : "silence",

      // Reserved for SpeechBrain later
      speaker_similarity: null,
      speaker_match: null,
      speaker_mismatch: null,

      message: isSpeechActive ? "Examinee speaking" : "Silence",
    };

    const io = req.app.get("io");

    if (io) {
      io.emit("voice-status", {
        session_id,
        voice_identity: voiceIdentity,
      });
    }

    return res.status(200).json({
      message: "Voice VAD received",
      voice_identity: voiceIdentity,
    });
  } catch (error) {
    console.error("VOICE VAD ERROR:", error);

    return res.status(500).json({
      error: "Failed to process voice VAD",
    });
  }
};
