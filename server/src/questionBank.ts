import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { BLOOM } from "./questions";

// The question bank: list, search, edit, approve, reject and delete the questions of a course
export const questionBankRouter = Router();

const questionsCol = () => getDB().collection("questions");
const topicsCol = () => getDB().collection("topics");
const closCol = () => getDB().collection("clos");

const STATUSES = ["pending", "approved", "rejected"] as const;

// Filters for the list. Everything is optional.
const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  type: z.enum(["mcq", "short", "broad"]).optional(),
  topicId: z.string().optional(),
  cloId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

// What a teacher may change. At least one field must be sent.
const patchSchema = z
  .object({
    text: z.string().trim().min(10).max(800).optional(),
    options: z.array(z.string().trim().min(1).max(300)).length(4).optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    answer: z.string().trim().min(3).max(3000).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    bloom: z.enum(BLOOM).optional(),
    cloId: z.string().optional(),
    topicId: z.string().optional(),
    status: z.enum(STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

// Makes user text safe to use inside a regular expression
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// List and search the questions of a course, with the number of questions in each status
questionBankRouter.get(
  "/:courseId/questions",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid filter" });
    }
    const { status, type, topicId, cloId, q, limit, skip } = parsed.data;

    const filter: Record<string, unknown> = { courseId: course._id };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (topicId) {
      if (!ObjectId.isValid(topicId))
        return res.status(400).json({ error: "Invalid topic" });
      filter.topicId = new ObjectId(topicId);
    }
    if (cloId) {
      if (!ObjectId.isValid(cloId))
        return res.status(400).json({ error: "Invalid CLO" });
      filter.cloId = new ObjectId(cloId);
    }
    if (q) filter.text = { $regex: escapeRegex(q), $options: "i" };

    const [list, total, grouped, topics] = await Promise.all([
      questionsCol()
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      questionsCol().countDocuments(filter),
      questionsCol()
        .aggregate([
          { $match: { courseId: course._id } },
          { $group: { _id: "$status", n: { $sum: 1 } } },
        ])
        .toArray(),
      topicsCol().find({ courseId: course._id }).toArray(),
    ]);

    // The counts ignore the filters, so the tabs can always show the real numbers
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const g of grouped) {
      if (g._id in counts) counts[g._id as keyof typeof counts] = g.n as number;
    }
    const topicName = new Map(
      topics.map((t) => [String(t._id), String(t.name)]),
    );

    res.json({
      counts,
      total,
      questions: list.map((d) => ({
        ...d,
        topicName: topicName.get(String(d.topicId)) ?? null,
      })),
    });
  },
);

// Edit a question and/or change its status (approve, reject, back to pending)
questionBankRouter.patch(
  "/:courseId/questions/:questionId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const questionId = String(req.params.questionId);
    if (!ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid question id" });
    }

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const change = parsed.data;

    const question = await questionsCol().findOne({
      _id: new ObjectId(questionId),
      courseId: course._id,
    });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Options and the correct answer exist only on multiple choice questions
    const touchesOptions =
      change.options !== undefined || change.correctIndex !== undefined;
    if (touchesOptions && question.type !== "mcq") {
      return res
        .status(400)
        .json({ error: "Only multiple choice questions have options" });
    }
    if (touchesOptions) {
      const options = change.options ?? (question.options as string[]);
      const distinct = new Set(options.map((o) => o.toLowerCase())).size === 4;
      if (!distinct) {
        return res
          .status(400)
          .json({ error: "The four options must be different" });
      }
    }

    const set: Record<string, unknown> = {};
    for (const key of [
      "text",
      "options",
      "correctIndex",
      "answer",
      "difficulty",
      "bloom",
    ] as const) {
      if (change[key] !== undefined) set[key] = change[key];
    }

    // A new CLO or topic must belong to this course
    if (change.cloId) {
      const clo = ObjectId.isValid(change.cloId)
        ? await closCol().findOne({
            _id: new ObjectId(change.cloId),
            courseId: course._id,
          })
        : null;
      if (!clo)
        return res.status(400).json({ error: "CLO not found in this course" });
      set.cloId = clo._id;
      set.cloCode = clo.code;
    }
    if (change.topicId) {
      const topic = ObjectId.isValid(change.topicId)
        ? await topicsCol().findOne({
            _id: new ObjectId(change.topicId),
            courseId: course._id,
          })
        : null;
      if (!topic)
        return res
          .status(400)
          .json({ error: "Topic not found in this course" });
      set.topicId = topic._id;
    }

    // Remember who changed the content, and who approved or rejected the question
    const me = new ObjectId(res.locals.user.id);
    if (["text", "options", "correctIndex", "answer"].some((k) => k in set)) {
      set.editedAt = new Date();
      set.editedBy = me;
    }
    if (change.status) {
      set.status = change.status;
      set.reviewedAt = new Date();
      set.reviewedBy = me;
    }

    const updated = await questionsCol().findOneAndUpdate(
      { _id: question._id },
      { $set: set },
      { returnDocument: "after" },
    );
    res.json({ question: updated });
  },
);

// Delete a question
questionBankRouter.delete(
  "/:courseId/questions/:questionId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const questionId = String(req.params.questionId);
    if (!ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid question id" });
    }

    const removed = await questionsCol().deleteOne({
      _id: new ObjectId(questionId),
      courseId: course._id,
    });
    if (!removed.deletedCount) {
      return res.status(404).json({ error: "Question not found" });
    }
    res.json({ ok: true });
  },
);
