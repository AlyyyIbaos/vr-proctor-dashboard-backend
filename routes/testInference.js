import express from "express";
import axios from "axios";

const router = express.Router();

router.post("/test-inference", async (req, res) => {
  try {
    // 1. Build a valid 60 × 12 payload (all zeros)
    const payload = {
      sequence: Array.from({ length: 60 }, () =>
        Array(12).fill(0.0)
      )
    };

    // 2. Call inference service
    const response = await axios.post(
      `${process.env.INFERENCE_SERVICE_URL}/predict`,
      payload,
      { timeout: 30000 } // important for cold start
    );

    // 3. Log result (for you)
    console.log("Inference response:", response.data);

    // 4. Return result to client
    return res.json({
      success: true,
      inference: response.data
    });

  } catch (error) {
    console.error("Inference error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
