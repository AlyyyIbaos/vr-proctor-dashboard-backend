import { createAlert } from "../controllers/alertController.js";

const alertSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("🔔 Proctor connected:", socket.id);

    /**
     * Receive detection event (from VR or simulator)
     */
    socket.on("new_detection", async (data) => {
      /*
        Expected data shape:
        {
          session_id,
          behavior_type,
          description,
          confidence,
          severity
        }
      */

      console.log("⚠️ Detection received:", data);

      const success = await createAlert(data);

      if (success) {
        io.emit("new_alert", {
          ...data,
          detected_at: new Date().toISOString(),
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected:", socket.id);
    });
  });
};



export default alertSocket;
