import express from "express";
import {
  createDetection,
  getDetectionsBySession,
} from "../controllers/detectionController.js";

const router = express.Router();

// Create alert
router.post("/", createDetection);

// Get alerts by session
router.get("/session/:sessionId", getDetectionsBySession);

export default router;
