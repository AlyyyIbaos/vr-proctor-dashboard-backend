import jwt from "jsonwebtoken";

export function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access Denied. No Token." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; // { id, role, name }
    next();

  } catch (err) {
    console.error("JWT Error:", err);
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Access denied. Wrong role." });
    }
    next();
  };
}
