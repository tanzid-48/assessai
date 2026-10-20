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
import { chunkPages, extractPdfPages, type PageText } from "./extract";

// Course materials (slides, notes) uploaded by teachers
export const materialsRouter = Router();

const materials = () => getDB().collection("materials");
const topics = () => getDB().collection("topics");
const chunks = () => getDB().collection("chunks");

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
        pages: m.pageCount ?? null,
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
    // PPTX text extraction is added in a later step
    if (ext !== ".pdf") {
      return reject(
        400,
        "PPTX reading is not ready yet. Please upload a PDF for now",
      );
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
      // Read the PDF first, so a broken or empty file is rejected before anything is saved
      let pageList: PageText[];
      try {
        pageList = await extractPdfPages(file.path);
      } catch (err) {
        console.error("PDF extraction failed:", err);
        return reject(400, "This PDF could not be read");
      }

      const pieces = chunkPages(pageList);
      if (pieces.length === 0) {
        return reject(
          400,
          "No readable text found in this PDF. Scanned PDFs are not supported yet, upload a PDF with selectable text",
        );
      }

      const fileName = realName(file.originalname);
      const inserted = await materials().insertOne({
        courseId: course._id,
        topicId,
        originalName: fileName,
        storedName: file.filename,
        ext,
        size: file.size,
        pageCount: pageList.length,
        uploadedBy: new ObjectId(res.locals.user.id),
        createdAt: new Date(),
      });

      // Save the chunks. Each one remembers the file, the page and the topic it came from.
      try {
        await chunks().insertMany(
          pieces.map((c) => ({
            courseId: course._id,
            materialId: inserted.insertedId,
            topicId,
            fileName,
            page: c.page,
            index: c.index,
            text: c.text,
          })),
        );
      } catch (err) {
        // Never keep a material without its chunks
        await materials().deleteOne({ _id: inserted.insertedId });
        throw err;
      }

      res.status(201).json({
        id: inserted.insertedId,
        pages: pageList.length,
        chunks: pieces.length,
      });
    } catch (err) {
      // Do not leave a file on disk that has no database record
      fs.rmSync(file.path, { force: true });
      throw err;
    }
  },
);

// Delete a material, its chunks and its file
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

    await chunks().deleteMany({ materialId: material._id });
    fs.rmSync(path.join(UPLOAD_ROOT, String(course._id), material.storedName), {
      force: true,
    });
    res.json({ ok: true });
  },
);
// Shows the chunks of one material, so the teacher can check what was read from the file
materialsRouter.get(
  "/:courseId/materials/:materialId/chunks",
  requireRole("admin", "teacher"),
  courseAccess,
  async (req, res) => {
    const course = res.locals.course;
    const materialId = String(req.params.materialId);
    if (!ObjectId.isValid(materialId)) {
      return res.status(400).json({ error: "Invalid material id" });
    }

    const list = await chunks()
      .find({ courseId: course._id, materialId: new ObjectId(materialId) })
      .sort({ index: 1 })
      .project({ page: 1, index: 1, text: 1 })
      .toArray();

    res.json({ count: list.length, chunks: list });
  },
);
// Streams the original PDF so the teacher can open it in a browser tab
materialsRouter.get(
  "/:courseId/materials/:materialId/file",
  requireRole("admin", "teacher"),
  courseAccess,
  async (req, res) => {
    const course = res.locals.course;
    const materialId = String(req.params.materialId);
    if (!ObjectId.isValid(materialId)) {
      return res.status(400).json({ error: "Invalid material id" });
    }

    const material = await materials().findOne({
      _id: new ObjectId(materialId),
      courseId: course._id,
    });
    if (!material) {
      return res.status(404).json({ error: "Material not found" });
    }

    // The path is built from ids and the random stored name, never from user input
    const filePath = path.join(
      UPLOAD_ROOT,
      String(course._id),
      String(material.storedName),
    );
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ error: "The file is missing on the server" });
    }

    // Show the PDF inside the tab, with its original name
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(String(material.originalName))}`,
    );
    res.sendFile(filePath);
  },
);
