import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { client, connectDB, getDB } from "./db";
import { auth } from "./auth";
import { requireAuth, requireRole } from "./middleware";
import { coursesRouter } from "./courses";
import { usersRouter } from "./users";
import { enrollmentsRouter, ensureEnrollmentIndexes } from "./enrollments";
import { outlineRouter } from "./outline";
import { materialsRouter } from "./materials";
import { searchRouter } from "./search";
import { questionsRouter } from "./questions";
import { questionBankRouter } from "./questionBank";
import { papersRouter } from "./papers";
import { assessmentsRouter } from "./assessments";


const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const app = express();

// Allow the Next.js client to call this API with cookies
app.use(cors({ origin: CLIENT_URL, credentials: true }));

// BetterAuth handles all /api/auth/* routes.
// It must be mounted BEFORE express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// ---------- API routes ----------

// Root route: friendly message instead of "Not found"
app.get("/", (_req, res) => {
  res.json({
    name: "PUB AssessAI API",
    status: "running",
    health: "/api/health",
  });
});

// Health check: confirms the server is up and the database responds
app.get("/api/health", async (_req, res) => {
  await getDB().command({ ping: 1 });
  res.json({
    ok: true,
    db: getDB().databaseName,
    time: new Date().toISOString(),
  });
});

// Returns the logged-in user (any role)
app.get("/api/me", requireAuth, (_req, res) => {
  const { id, name, email, role } = res.locals.user;
  res.json({ user: { id, name, email, role } });
});

// Test route to prove role checks work (admin only). Remove later.
app.get("/api/admin/ping", requireRole("admin"), (_req, res) => {
  res.json({ ok: true, message: "Hello admin" });
});

// Feature routers, one file per feature.
// They must all be mounted BEFORE the "not found" fallback below.
app.use("/api/courses", coursesRouter);
app.use("/api/courses", outlineRouter);
app.use("/api/courses", materialsRouter);
app.use("/api/courses", searchRouter);
app.use("/api/courses", questionsRouter);
app.use("/api/courses", questionBankRouter);
app.use("/api/courses", papersRouter);
app.use("/api/courses", assessmentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/enrollments", enrollmentsRouter);

// --------------------------------

// Fallback for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Central error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server" });
  },
);

async function main() {
  await connectDB();
  await ensureEnrollmentIndexes();
  app.listen(PORT, () => {
    console.log(`AssessAI server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start the server:", err);
  process.exit(1);
});

// Close the database connection when the process is stopped
process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});
