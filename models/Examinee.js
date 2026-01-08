import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  fullName: { type: String, required: true },
  status: {
    type: String,
    enum: ["online", "away", "offline", "finished"],
    default: "offline"
  },
  lastActive: { type: Date, default: Date.now },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" }
}, { timestamps: true });

export default mongoose.model("Student", studentSchema);
