import express from "express";
import { receiveVoiceVAD } from "../controllers/vrVoiceController.js";

const router = express.Router();

router.post("/voice-vad", receiveVoiceVAD);

export default router;
