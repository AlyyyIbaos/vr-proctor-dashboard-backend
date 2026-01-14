import express from "express";
import axios from "axios";

const router = express.Router();

router.post("/test-inference", async (req, res) => {
  try {
    // 🔹 1. Build a VALID 60 × 12 payload (all zeros)
    const payload = {
      sequence: Array.from({ length: 60 }, () =>
        Array(12).fill(0.0)
      )
    };

    console.log("Calling inference service at:", process.env.INFERENCE_SERVICE_URL);

    // 🔹 2. Call inference service
    const response = await axios.post(
      `${process.env.INFERENCE_SERVICE_URL}/predict`,
      payload,
      {
        timeout: 90000, // 90 seconds for Render cold start
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    // 🔹 3. Log inference response
    console.log("Inference SUCCESS:", response.data);

    // 🔹 4. Return success
    return res.json({
      success: true,
      inference: response.data
    });

  } catch (error) {
    console.error("Inference call FAILED");

    // 🔴 Case 1: Inference responded with an error (e.g. 503)
    if (error.response) {
      console.error("Inference response status:", error.response.status);
      console.error("Inference response data:", error.response.data);

      return res.status(502).json({
        success: false,
        error: "Inference responded with error",
        inference_status: error.response.status,
        inference_data: error.response.data
      });
    }

    // 🔴 Case 2: Request sent but no response (timeout / network)
    if (error.request) {
      console.error("No response received from inference service");

      return res.status(502).json({
        success: false,
        error: "No response received from inference service"
      });
    }

    // 🔴 Case 3: Axios / config error
    console.error("Axios error message:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
