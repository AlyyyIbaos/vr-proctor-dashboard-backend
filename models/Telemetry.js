import mongoose from "mongoose";

const telemetrySchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  examId: String,

  headRotation: {
    yaw: Number,
    pitch: Number,
    roll: Number
  },

  handMovement: Number,
  voiceActivity: Number,

  // Environment events sent from Unity
  envEvent: {
    type: String,       // "UNAUTHORIZED_OBJECT" | "ENVIRONMENT_MODIFICATION"
    details: Object
  },

  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Telemetry", telemetrySchema);
