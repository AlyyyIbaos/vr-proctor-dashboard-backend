import jwt from "jsonwebtoken";
import supabase from "../config/supabaseClient.js";

const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === "true";
const DEV_BYPASS_ROLE = process.env.DEV_BYPASS_ROLE || "student";

// Log once on startup (cleaner logs)
if (DEV_BYPASS_AUTH) {
  console.warn("⚠️ DEV_BYPASS_AUTH ENABLED — Authentication is bypassed.");
}

export async function requireVerifiedSession(req, res, next) {
  try {
    // =========================
    // 🚧 DEV MODE BYPASS
    // =========================
    if (DEV_BYPASS_AUTH) {
      req.auth = {
        auth_session_id: "dev-auth-session",
        user_id: "dev-user",
        role: DEV_BYPASS_ROLE,
      };

      return next();
    }

    // =========================
    // NORMAL AUTH FLOW
    // =========================
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization token" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { auth_session_id, user_id, role } = decoded;

    if (!auth_session_id || !user_id) {
      return res.status(401).json({ error: "Invalid session token payload" });
    }

    const { data: authSession, error } = await supabase
      .from("auth_sessions")
      .select("status, expires_at")
      .eq("id", auth_session_id)
      .single();

    if (error || !authSession) {
      return res
        .status(401)
        .json({ error: "Authentication session not found" });
    }

    if (authSession.status !== "verified") {
      return res.status(403).json({ error: "Session not verified" });
    }

    if (new Date(authSession.expires_at) < new Date()) {
      return res.status(401).json({ error: "Authentication session expired" });
    }

    req.auth = {
      auth_session_id,
      user_id,
      role,
    };

    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err.message);
    return res.status(401).json({ error: "Invalid or expired exam session" });
  }
}
