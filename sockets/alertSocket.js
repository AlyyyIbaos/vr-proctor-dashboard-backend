const alertSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("🔔 Proctor connected:", socket.id);

    /**
     * Join a session room
     */
    socket.on("join_session", (sessionId) => {
      socket.join(sessionId);
      console.log(`🔗 Socket joined session ${sessionId}`);
    });

    socket.on("leave_session", (sessionId) => {
      socket.leave(sessionId);
      console.log(`🔌 Socket left session ${sessionId}`);
    });

    /**
     * Emit cheating log in real-time
     * This should be called AFTER DB insert succeeds
     */
    socket.on("emit_cheating_log", (log) => {
      /*
        Expected log shape (SSOT):
        {
          id,
          session_id,
          event_type,
          severity,
          confidence_level,
          details,
          detected_at
        }
      */

      if (!log?.session_id) {
        console.warn("⚠️ Invalid cheating log payload:", log);
        return;
      }

      console.log("🚨 Live cheating log:", log);

      // Emit ONLY to session room
      io.to(log.session_id).emit("new_alert", log);
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected:", socket.id);
    });
  });
};

export default alertSocket;
