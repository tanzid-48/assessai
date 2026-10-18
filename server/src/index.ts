import "dotenv/config";
import express from "express";
import cors from "cors";
import { client, connectDB, getDB } from "./db";

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const app = express();

// Allow the Next.js client to call this API with cookies
app.use(cors({ origin: CLIENT_URL, credentials: true }));
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

// Feature routers will be mounted here later, one file per feature:
// app.use("/api/courses", coursesRouter);
// app.use("/api/questions", questionsRouter);
// app.use("/api/exams", examsRouter);

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
