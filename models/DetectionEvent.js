import mongoose from "mongoose";

const CheatingEventSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  examId: String,

  type: { type: String, required: true }, 
  // HEAD_POSE, HAND_MOVEMENT, VOICE_DETECTED, UNAUTHORIZED_OBJECT, ENVIRONMENT_MODIFIED

  description: String,
  severity: { 
    type: String, 
    enum: ["minor", "moderate", "severe"], 
    default: "minor" 
  },

  rawTelemetry: Object,
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("CheatingEvent", CheatingEventSchema);
