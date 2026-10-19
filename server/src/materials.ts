import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";

// Course materials (slides, notes) uploaded by teachers
export const materialsRouter = Router();

const materials = () => getDB().collection("materials");
const topics = () => getDB().collection("topics");

// Files are stored on the server disk, one folder per course
const UPLOAD_ROOT = path.resolve("uploads");
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXT = [".pdf", ".pptx"];

// multer decodes file names as latin1, so restore the real UTF-8 name (e.g. Bangla names)
function realName(name: string) {
  return Buffer.from(name, "latin1").toString("utf8");
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // courseId was already validated by courseAccess, so it is safe to use in a path
    const dir = path.join(UPLOAD_ROOT, String(req.params.courseId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // A random name on disk avoids clashes and unsafe file names
  filename: (_req, file, cb) => {
    cb(
      null,
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase(),
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(realName(file.originalname)).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) return cb(null, true);
    cb(new Error("Only PDF and PPTX files are allowed"));
  },
});

// Checks that the logged-in user may manage the course BEFORE any file is written
async function courseAccess(req: Request, res: Response, next: NextFunction) {
  const result = await loadCourse(String(req.params.courseId), res.locals.user);
  if ("error" in result)
    return res.status(result.status).json({ error: result.error });
  res.locals.course = result.course;
  next();
}

// Runs multer and turns its errors into clean JSON responses
function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "The file is too large (maximum 25 MB)" });
    }
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : "Upload failed" });
  });
}

// Checks the real content of the file, not only its name
function hasValidSignature(filePath: string, ext: string) {
  const fd = fs.openSync(filePath, "r");
  const head = Buffer.alloc(5);
  try {
    fs.readSync(fd, head, 0, 5, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (ext === ".pdf") return head.toString("latin1") === "%PDF-";
  // A PPTX file is a ZIP archive, which always starts with "PK"
  return head[0] === 0x50 && head[1] === 0x4b;
}

// List the materials of a course, newest first
materialsRouter.get(
  "/:courseId/materials",
  requireRole("admin", "teacher"),
  courseAccess,
  async (_req, res) => {
    const course = res.locals.course;
    const [list, topicList] = await Promise.all([
      materials()
        .find({ courseId: course._id })
        .sort({ createdAt: -1 })
        .toArray(),
      topics().find({ courseId: course._id }).toArray(),
    ]);
    const topicName = new Map(
      topicList.map((t) => [String(t._id), t.name as string]),
    );

    res.json({
      materials: list.map((m) => ({
        _id: m._id,
        name: m.originalName,
        type: String(m.ext).slice(1),
        size: m.size,
        topicId: m.topicId ? String(m.topicId) : null,
        topicName: m.topicId
          ? (topicName.get(String(m.topicId)) ?? null)
          : null,
        createdAt: m.createdAt,
      })),
    });
  },
);

// Upload one file (form field "file") with an optional topicId
materialsRouter.post(
  "/:courseId/materials",
  requireRole("admin", "teacher"),
  courseAccess,
  receiveFile,
  async (req, res) => {
    const course = res.locals.course;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Choose a PDF or PPTX file" });
    }

    // Remove the saved file again when the request turns out to be invalid
    const reject = (status: number, error: string) => {
      fs.rmSync(file.path, { force: true });
      return res.status(status).json({ error });
    };

    const ext = path.extname(file.filename).toLowerCase();
    if (!hasValidSignature(file.path, ext)) {
      return reject(400, "This file is not a real PDF or PPTX");
    }

    // The topic is optional, but if given it must belong to this course
    let topicId: ObjectId | null = null;
    const rawTopic = String(req.body?.topicId ?? "");
    if (rawTopic) {
      const topic = ObjectId.isValid(rawTopic)
        ? await topics().findOne({
            _id: new ObjectId(rawTopic),
            courseId: course._id,
          })
        : null;
      if (!topic) return reject(400, "Topic not found in this course");
      topicId = topic._id;
    }

    try {
      const inserted = await materials().insertOne({
        courseId: course._id,
        topicId,
        originalName: realName(file.originalname),
        storedName: file.filename,
        ext,
        size: file.size,
        uploadedBy: new ObjectId(res.locals.user.id),
        createdAt: new Date(),
      });
      res.status(201).json({ id: inserted.insertedId });
    } catch (err) {
      // Do not leave a file on disk that has no database record
      fs.rmSync(file.path, { force: true });
      throw err;
    }
  },
);

// Delete a material and its file
materialsRouter.delete(
  "/:courseId/materials/:materialId",
  requireRole("admin", "teacher"),
  courseAccess,
  async (req, res) => {
    const course = res.locals.course;
    const materialId = String(req.params.materialId);
    if (!ObjectId.isValid(materialId)) {
      return res.status(400).json({ error: "Invalid material id" });
    }

    const material = await materials().findOneAndDelete({
      _id: new ObjectId(materialId),
      courseId: course._id,
    });
    if (!material) {
      return res.status(404).json({ error: "Material not found" });
    }

    // Chunks of this material will be deleted here too, once they exist
    fs.rmSync(path.join(UPLOAD_ROOT, String(course._id), material.storedName), {
      force: true,
    });
    res.json({ ok: true });
  },
);
