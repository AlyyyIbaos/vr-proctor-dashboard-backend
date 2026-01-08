import mongoose from "mongoose";

const examLogSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    eventType: { type: String, required: true },
    details: { type: Object, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("ExamLog", examLogSchema);
