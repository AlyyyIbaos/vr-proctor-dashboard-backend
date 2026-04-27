import fetch from "node-fetch";

const PYTHON_URL = process.env.INFERENCE_SERVICE_URL || "http://localhost:8000";

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

    const io = req.app.get("io");

    /*
    =========================
    CASE 1: SILENCE (NO PYTHON CALL)
    =========================
    */
    if (vadValue <= vadThreshold) {
      const voiceIdentity = {
        session_id,
        question_index,
        vad_prob: vadValue,
        speech_active: false,
        status: "silence",
        speaker_similarity: null,
        speaker_match: null,
        speaker_mismatch: null,
        message: "Silence",
      };

      if (io) {
        io.emit("voice-status", {
          session_id,
          voice_identity: voiceIdentity,
        });
      }

      return res.status(200).json({
        message: "Voice VAD processed (silence)",
        voice_identity: voiceIdentity,
      });
    }

    /*
    =========================
    CASE 2: SPEECH → CALL PYTHON
    =========================
    */
    let pythonResult = null;

    try {
      const response = await fetch(`${PYTHON_URL}/voice-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id,
          question_index,
          vad_prob: vadValue,
          speech_active: true,
        }),
      });

      pythonResult = await response.json();
    } catch (err) {
      console.error("⚠️ Python voice-check failed:", err);
    }

    const voiceIdentity = {
      session_id,
      question_index,
      vad_prob: vadValue,
      speech_active: true,
      status: pythonResult?.status || "speech_detected",
      speaker_similarity: pythonResult?.speaker_similarity ?? null,
      speaker_match: pythonResult?.speaker_match ?? null,
      speaker_mismatch: pythonResult?.speaker_mismatch ?? null,
      message: pythonResult?.speaker_mismatch
        ? "Possible non-enrolled speaker detected during speech-active segment."
        : "Examinee speaking",
    };

    if (io) {
      io.emit("voice-status", {
        session_id,
        voice_identity: voiceIdentity,
      });
    }

    return res.status(200).json({
      message: "Voice VAD processed (with Python)",
      voice_identity: voiceIdentity,
    });
  } catch (error) {
    console.error("VOICE VAD ERROR:", error);

    return res.status(500).json({
      error: "Failed to process voice VAD",
    });
  }
};
