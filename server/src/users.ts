import { Router } from "express";
import { getDB } from "./db";
import { requireRole } from "./middleware";

export const usersRouter = Router();

// List users by role, e.g. /api/users?role=teacher (admin only).
// Only safe fields are returned, never any password data.
usersRouter.get("/", requireRole("admin"), async (req, res) => {
  const role = String(req.query.role ?? "");
  if (!["admin", "teacher", "student"].includes(role)) {
    return res
      .status(400)
      .json({ error: "role must be admin, teacher or student" });
  }

  const list = await getDB()
    .collection("user")
    .find({ role }, { projection: { name: 1, email: 1, role: 1 } })
    .sort({ name: 1 })
    .toArray();

  res.json({
    users: list.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
    })),
  });
});
