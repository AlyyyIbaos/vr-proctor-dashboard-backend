import express from "express";
import {
  createSession,
  getActiveSessions,
  getDashboardSummary,
  getSessionDetails,
  getStudentHistory,
} from "../controllers/sessionController.js";
import { requireVerifiedSession } from "../middleware/authMiddleware.js";

const router = express.Router();

// 🔐 PROTECT ALL SESSION ROUTES
router.use(requireVerifiedSession);

// CREATE session
router.post("/", createSession);

// DASHBOARD
router.get("/active", getActiveSessions);
router.get("/summary", getDashboardSummary);
router.get("/student/history", getStudentHistory);

// SESSION DETAILS
router.get("/:id", getSessionDetails);

export default router;
