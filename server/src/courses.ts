import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";

export const coursesRouter = Router();

// Shape of the data an admin sends when creating a course
const courseSchema = z.object({
  code: z.string().trim().min(3).max(20),
  title: z.string().trim().min(3).max(120),
  credits: z.number().min(0.5).max(6),
  teacherId: z.string().optional(),
});

const courses = () => getDB().collection("courses");

// List courses: admin sees all, a teacher sees only the courses assigned to them
coursesRouter.get("/", requireRole("admin", "teacher"), async (_req, res) => {
  const user = res.locals.user;
  const filter =
    user.role === "teacher" ? { teacherId: new ObjectId(user.id) } : {};

  const list = await courses().find(filter).sort({ code: 1 }).toArray();
  res.json({ courses: list });
});

// Create a course (admin only)
coursesRouter.post("/", requireRole("admin"), async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input",
      details: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    });
  }

  const { title, credits, teacherId } = parsed.data;
  const code = parsed.data.code.toUpperCase();

  // Course codes must be unique
  if (await courses().findOne({ code })) {
    return res.status(409).json({ error: `Course ${code} already exists` });
  }

  // If a teacher is given, make sure that user exists and really is a teacher
  let teacherObjectId: ObjectId | null = null;
  if (teacherId) {
    if (!ObjectId.isValid(teacherId)) {
      return res.status(400).json({ error: "Invalid teacherId" });
    }
    const teacher = await getDB()
      .collection("user")
      .findOne({ _id: new ObjectId(teacherId), role: "teacher" });
    if (!teacher) {
      return res.status(400).json({ error: "Teacher not found" });
    }
    teacherObjectId = teacher._id;
  }

  const doc = {
    code,
    title,
    credits,
    teacherId: teacherObjectId,
    createdAt: new Date(),
  };
  const result = await courses().insertOne(doc);
  res.status(201).json({ course: { _id: result.insertedId, ...doc } });
});
