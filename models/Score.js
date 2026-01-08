import mongoose from "mongoose";

const scoreSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true },
    examType: { type: String, required: true },
    score: { type: Number, required: true },
    dateTaken: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model("Score", scoreSchema);
