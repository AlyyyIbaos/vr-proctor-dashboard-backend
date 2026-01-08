import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  examName: { type: String, required: true },
  course: { type: String, required: true },
  startedAt: { type: Date, default: null },
  endingAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ["not_started", "ongoing", "finished"],
    default: "not_started"
  },
  students: [
    {
      studentId: { type: String },
      fullName: { type: String }
    }
  ]
});

const Exam = mongoose.model("Exam", examSchema);
export default Exam;
