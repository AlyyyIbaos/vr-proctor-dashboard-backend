// routes/vrTestRoutes.js
import express from "express";

const router = express.Router();

/**
 * VR → Backend connectivity test
 * No database, no auth
 */
router.post("/ping", (req, res) => {
  const { device_id, scene_name } = req.body;

  console.log("VR DEVICE CONNECTED:", {
    device_id,
    scene_name,
    timestamp: new Date().toISOString(),
  });

  res.json({
    status: "ok",
    message: "VR connected successfully",
    received: {
      device_id,
      scene_name,
    },
  });
});

export default router;
