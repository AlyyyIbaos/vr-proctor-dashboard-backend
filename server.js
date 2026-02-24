import "./env.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import morgan from "morgan";

// ROUTES
import authRoutes from "./routes/authRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import detectionRoutes from "./routes/detectionRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import vrTestRoutes from "./routes/vrTestRoutes.js";
import vrScoreRoutes from "./routes/vrScoreRoutes.js";
import testInferenceRoute from "./routes/testInference.js";
import telemetryRoutes from "./routes/telemetryRoutes.js";
import aggregationRoutes from "./routes/aggregationRoutes.js";

// SOCKETS
import alertSocket from "./sockets/alertSocket.js";

const app = express();

/*
===========================================
CORS CONFIG (FIXED - EXPRESS SAFE)
===========================================
*/
const allowedOrigins = [
  "http://localhost:3000",
  "https://vr-proctor-dashboard-frontend-d60z81vk5-alyyyibaos-projects.vercel.app",
];

app.use(
  cors({
    origin: true, // reflect request origin automatically
    credentials: true,
  }),
);

app.use(express.json());
app.use(morgan("dev"));

// ==============================
// HTTP + SOCKET.IO
// ==============================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log("✅ Socket.IO initialized");

// ==============================
// API ROUTES
// ==============================
app.set("io", io);

app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/detections", detectionRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/vr", vrTestRoutes);
app.use("/api/vr", vrScoreRoutes);
app.use("/api", testInferenceRoute);
app.use("/api/vr", telemetryRoutes(io));
app.use("/api/sessions", aggregationRoutes);

// ==============================
// SOCKET.IO ALERTS
// ==============================
alertSocket(io);

// ==============================
// HEALTH CHECK
// ==============================
app.get("/", (req, res) => {
  res.send("VR Proctor Backend is running");
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
