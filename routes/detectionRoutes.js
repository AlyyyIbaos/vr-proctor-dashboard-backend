import express from "express";
import {
  createCheatingLog,
  getCheatingLogsBySession,
} from "../controllers/detectionController.js";

const router = express.Router();

// VR + AI detections
router.post("/cheating-log", createCheatingLog);

// Dashboard
router.get("/session/:sessionId", getCheatingLogsBySession);

export default router;
