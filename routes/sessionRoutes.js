import express from "express";
import {
  getActiveSessions,
  getDashboardSummary,
  getSessionDetails,
} from "../controllers/sessionController.js";

const router = express.Router();

router.get("/active", getActiveSessions);
router.get("/summary", getDashboardSummary);
router.get("/:id", getSessionDetails);

export default router;
