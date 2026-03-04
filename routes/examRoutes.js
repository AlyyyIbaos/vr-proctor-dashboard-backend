import express from "express";
import { getLiveExams } from "../controllers/examController.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
==================================================
GET LIVE EXAMS FOR PROCTOR DASHBOARD
GET /api/exams/live
==================================================
*/

router.get("/live", requireVerifiedSession, getLiveExams);

export default router;
