import express from "express";
import {
  createSession,
  getActiveSessions,
  getDashboardSummary,
  getSessionDetails,
} from "../controllers/sessionController.js";

const router = express.Router();

// CREATE session
router.post("/", createSession);

// DASHBOARD
router.get("/active", getActiveSessions);
router.get("/summary", getDashboardSummary);

// SESSION DETAILS
router.get("/:id", getSessionDetails);

export default router;
