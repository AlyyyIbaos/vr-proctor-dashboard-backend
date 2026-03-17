import express from "express";
import { getLiveExams } from "../controllers/examController.js";

const router = express.Router();

/*
==================================================
GET LIVE EXAMS FOR PROCTOR DASHBOARD
GET /api/exams/live
==================================================


Proctors monitor all live exams.
This endpoint should NOT require exam session auth.
*/

router.get("/live", getLiveExams);

export default router;
