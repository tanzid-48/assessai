import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";

// CLOs (course learning outcomes) and topics of a course
export const outlineRouter = Router();

const courses = () => getDB().collection("courses");
const clos = () => getDB().collection("clos");
const topics = () => getDB().collection("topics");

const cloSchema = z.object({ text: z.string().trim().min(5).max(300) });
const topicSchema = z.object({ name: z.string().trim().min(2).max(100) });

// Loads the course and checks that the user may manage it:
// admins can manage every course, a teacher only the courses assigned to them.
export async function loadCourse(
  courseIdParam: string,
  user: { id: string; role?: string },
) {
  if (!ObjectId.isValid(courseIdParam)) {
    return { status: 400, error: "Invalid course id" } as const;
  }
  const course = await courses().findOne({ _id: new ObjectId(courseIdParam) });
  if (!course) {
    return { status: 404, error: "Course not found" } as const;
  }
  const isOwner = course.teacherId && String(course.teacherId) === user.id;
  if (user.role !== "admin" && !isOwner) {
    return { status: 403, error: "This is not your course" } as const;
  }
  return { course } as const;
}

// Everything about one course: its CLOs and its topics
outlineRouter.get(
  "/:courseId/outline",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const [cloList, topicList] = await Promise.all([
      clos().find({ courseId: course._id }).sort({ number: 1 }).toArray(),
      topics().find({ courseId: course._id }).sort({ order: 1 }).toArray(),
    ]);

    res.json({
      course: { _id: course._id, code: course.code, title: course.title },
      clos: cloList,
      topics: topicList,
    });
  },
);

// Add a CLO. Its code (CLO1, CLO2, ...) is created automatically.
outlineRouter.post(
  "/:courseId/clos",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = cloSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "CLO text must be between 5 and 300 characters" });
    }

    // The next number is the highest existing one plus 1, so deleted numbers are never reused
    const last = await clos()
      .find({ courseId: course._id })
      .sort({ number: -1 })
      .limit(1)
      .toArray();
    const number = (last[0]?.number ?? 0) + 1;

    const doc = {
      courseId: course._id,
      number,
      code: `CLO${number}`,
      text: parsed.data.text,
      createdAt: new Date(),
    };
    const inserted = await clos().insertOne(doc);
    res.status(201).json({ clo: { _id: inserted.insertedId, ...doc } });
  },
);

// Delete a CLO
outlineRouter.delete(
  "/:courseId/clos/:cloId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const cloId = String(req.params.cloId);
    if (!ObjectId.isValid(cloId)) {
      return res.status(400).json({ error: "Invalid CLO id" });
    }

    const removed = await clos().deleteOne({
      _id: new ObjectId(cloId),
      courseId: course._id,
    });
    if (!removed.deletedCount) {
      return res.status(404).json({ error: "CLO not found" });
    }
    res.json({ ok: true });
  },
);

// Add a topic. Topic names must be unique inside a course (ignoring upper/lower case).
outlineRouter.post(
  "/:courseId/topics",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = topicSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Topic name must be between 2 and 100 characters" });
    }

    const name = parsed.data.name;
    const nameKey = name.toLowerCase();
    if (await topics().findOne({ courseId: course._id, nameKey })) {
      return res.status(409).json({ error: `Topic "${name}" already exists` });
    }

    const last = await topics()
      .find({ courseId: course._id })
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    const order = (last[0]?.order ?? 0) + 1;

    const doc = {
      courseId: course._id,
      name,
      nameKey,
      order,
      createdAt: new Date(),
    };
    const inserted = await topics().insertOne(doc);
    res.status(201).json({ topic: { _id: inserted.insertedId, ...doc } });
  },
);

// Delete a topic
outlineRouter.delete(
  "/:courseId/topics/:topicId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const topicId = String(req.params.topicId);
    if (!ObjectId.isValid(topicId)) {
      return res.status(400).json({ error: "Invalid topic id" });
    }

    const removed = await topics().deleteOne({
      _id: new ObjectId(topicId),
      courseId: course._id,
    });
    if (!removed.deletedCount) {
      return res.status(404).json({ error: "Topic not found" });
    }
    res.json({ ok: true });
  },
);
