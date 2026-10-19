import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";

export const enrollmentsRouter = Router();

const enrollments = () => getDB().collection("enrollments");
const users = () => getDB().collection("user");
const courses = () => getDB().collection("courses");

// A student can be enrolled in a course only once. The database enforces this.
export async function ensureEnrollmentIndexes() {
  await enrollments().createIndex(
    { courseId: 1, studentId: 1 },
    { unique: true },
  );
}

const enrollSchema = z.object({
  courseId: z.string(),
  studentIds: z.array(z.string()).min(1).max(200),
});

// List the students enrolled in one course (admin only)
enrollmentsRouter.get("/", requireRole("admin"), async (req, res) => {
  const courseId = String(req.query.courseId ?? "");
  if (!ObjectId.isValid(courseId)) {
    return res.status(400).json({ error: "Invalid courseId" });
  }

  const rows = await enrollments()
    .find({ courseId: new ObjectId(courseId) })
    .toArray();

  const students = rows.length
    ? await users()
        .find(
          { _id: { $in: rows.map((r) => r.studentId) } },
          { projection: { name: 1, email: 1 } },
        )
        .toArray()
    : [];
  const byId = new Map(students.map((s) => [String(s._id), s]));

  res.json({
    enrollments: rows.map((r) => {
      const s = byId.get(String(r.studentId));
      return {
        id: String(r._id),
        studentId: String(r.studentId),
        name: (s?.name as string) ?? "Unknown",
        email: (s?.email as string) ?? "",
      };
    }),
  });
});

// Enrol one or more students in a course (admin only)
enrollmentsRouter.post("/", requireRole("admin"), async (req, res) => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { courseId, studentIds } = parsed.data;
  if (![courseId, ...studentIds].every((id) => ObjectId.isValid(id))) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const course = await courses().findOne({ _id: new ObjectId(courseId) });
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }

  // Only real students can be enrolled, so every id must belong to a student
  const ids = [...new Set(studentIds)].map((id) => new ObjectId(id));
  const found = await users().countDocuments({
    _id: { $in: ids },
    role: "student",
  });
  if (found !== ids.length) {
    return res
      .status(400)
      .json({ error: "Some of the selected users are not students" });
  }

  // Upsert, so enrolling someone twice never creates a duplicate
  let added = 0;
  for (const studentId of ids) {
    const result = await enrollments().updateOne(
      { courseId: course._id, studentId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount) added++;
  }

  res.status(201).json({ added, alreadyEnrolled: ids.length - added });
});

// Remove a student from a course (admin only)
enrollmentsRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const result = await enrollments().deleteOne({ _id: new ObjectId(id) });
  if (!result.deletedCount) {
    return res.status(404).json({ error: "Enrolment not found" });
  }
  res.json({ ok: true });
});

// The logged-in student's own courses
enrollmentsRouter.get("/mine", requireRole("student"), async (_req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const rows = await enrollments().find({ studentId }).toArray();

  const list = rows.length
    ? await courses()
        .find({ _id: { $in: rows.map((r) => r.courseId) } })
        .sort({ code: 1 })
        .toArray()
    : [];

  // Attach the teacher's name to each course
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
      _id: String(c._id),
      code: c.code,
      title: c.title,
      credits: c.credits,
      teacherName: c.teacherId
        ? (nameById.get(String(c.teacherId)) ?? null)
        : null,
    })),
  });
});
