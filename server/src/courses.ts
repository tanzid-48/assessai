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

// teacherId is a user id, or null to remove the teacher from the course
const assignSchema = z.object({
  teacherId: z.string().nullable(),
});

const courses = () => getDB().collection("courses");
const users = () => getDB().collection("user");

// Find a user by id and make sure that user really is a teacher
async function findTeacher(teacherId: string) {
  if (!ObjectId.isValid(teacherId)) return null;
  return users().findOne({ _id: new ObjectId(teacherId), role: "teacher" });
}

// List courses: admin sees all, a teacher sees only the courses assigned to them
coursesRouter.get("/", requireRole("admin", "teacher"), async (_req, res) => {
  const user = res.locals.user;
  const filter =
    user.role === "teacher" ? { teacherId: new ObjectId(user.id) } : {};

  const list = await courses().find(filter).sort({ code: 1 }).toArray();

  // Attach the teacher's name to each course so the UI can show it
  const teacherIds = list.map((c) => c.teacherId).filter(Boolean);
  const teachers = teacherIds.length
    ? await users()
        .find({ _id: { $in: teacherIds } }, { projection: { name: 1 } })
        .toArray()
    : [];
  const nameById = new Map(
    teachers.map((t) => [String(t._id), t.name as string]),
  );

  res.json({
    courses: list.map((c) => ({
      ...c,
      teacherName: c.teacherId
        ? (nameById.get(String(c.teacherId)) ?? null)
        : null,
    })),
  });
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
    const teacher = await findTeacher(teacherId);
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

// Assign a teacher to a course, or remove the teacher with { "teacherId": null } (admin only)
coursesRouter.patch("/:id/teacher", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid course id" });
  }

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "teacherId must be a string or null" });
  }

  let teacherObjectId: ObjectId | null = null;
  if (parsed.data.teacherId) {
    const teacher = await findTeacher(parsed.data.teacherId);
    if (!teacher) {
      return res.status(400).json({ error: "Teacher not found" });
    }
    teacherObjectId = teacher._id;
  }

  const updated = await courses().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { teacherId: teacherObjectId } },
    { returnDocument: "after" },
  );
  if (!updated) {
    return res.status(404).json({ error: "Course not found" });
  }

  res.json({ course: updated });
});
