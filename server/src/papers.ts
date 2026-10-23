import { Router } from "express";
import { z } from "zod";
import { ObjectId, type Document, type WithId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { renderDocx } from "./exportPaper";
// Question papers: a teacher builds a paper from approved questions.
// A paper has numbered questions, and every numbered question has parts (a, b, ...).
// Every part has its own marks, one question and an optional "Or" choice.
export const papersRouter = Router();

const papersCol = () => getDB().collection("papers");
const questionsCol = () => getDB().collection("questions");
const topicsCol = () => getDB().collection("topics");
const closCol = () => getDB().collection("clos");

const MAX_QUESTIONS = 30; // numbered questions in one paper
const MAX_PARTS = 6; // parts (a, b, c ...) in one numbered question

const DEFAULT_INSTRUCTIONS =
  "[Answer all of the following questions. Figures in the right margin indicate marks allocated for the corresponding question]";

// Marks come in steps of 0.5
const marksSchema = z.number().min(0.5).max(100).multipleOf(0.5);

// The printed header of the paper
const headerSchema = z.object({
  title: z.string().trim().min(3).max(120),
  program: z.string().trim().max(120),
  batch: z.string().trim().max(30),
  semester: z.string().trim().max(30),
  durationMinutes: z.number().int().min(5).max(600),
  instructions: z.string().trim().max(500),
  coLabel: z.enum(["CO", "CLO"]),
});
const HEADER_KEYS = [
  "title",
  "program",
  "batch",
  "semester",
  "durationMinutes",
  "instructions",
  "coLabel",
] as const;

// Creating a paper: the header and the layout, which lists the marks of every part of every question
const createSchema = headerSchema.partial().extend({
  title: headerSchema.shape.title,
  layout: z
    .array(z.array(marksSchema).min(1).max(MAX_PARTS))
    .min(1)
    .max(MAX_QUESTIONS),
});

// Changing a paper: any header field, and/or the whole list of questions
const slotSchema = z.object({
  marks: marksSchema,
  questionId: z.string().nullable(),
  orQuestionId: z.string().nullable(),
});
const structureSchema = z
  .array(z.object({ parts: z.array(slotSchema).min(1).max(MAX_PARTS) }))
  .min(1)
  .max(MAX_QUESTIONS);
const updateSchema = headerSchema
  .partial()
  .extend({ questions: structureSchema.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

type StoredSlot = {
  marks: number;
  questionId: ObjectId | null;
  orQuestionId: ObjectId | null;
};
type StoredQuestion = { parts: StoredSlot[] };

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue
    ? `Invalid input, ${issue.path.join(".") || "request"}: ${issue.message}`
    : "Invalid input";
}

// "Question 2 (b)" or just "Question 2" when the question has only one part
const slotLabel = (qi: number, pi: number, partCount: number) =>
  `Question ${qi + 1}${partCount > 1 ? ` (${String.fromCharCode(97 + pi)})` : ""}`;

export async function loadPaper(courseId: ObjectId, paperIdParam: string) {
  if (!ObjectId.isValid(paperIdParam)) return null;
  return papersCol().findOne({ _id: new ObjectId(paperIdParam), courseId });
}

// Checks the question list a teacher sent. Returns a message when something is wrong.
async function checkStructure(
  courseId: ObjectId,
  structure: z.infer<typeof structureSchema>,
  previous: WithId<Document>,
): Promise<string | null> {
  const ids: string[] = [];
  for (const q of structure) {
    for (const p of q.parts) {
      if (p.orQuestionId && !p.questionId)
        return "A choice (Or) needs a main question first";
      if (p.questionId) ids.push(p.questionId);
      if (p.orQuestionId) ids.push(p.orQuestionId);
    }
  }
  if (ids.some((id) => !ObjectId.isValid(id))) return "Invalid question id";
  if (new Set(ids).size !== ids.length)
    return "The same question cannot be used twice in one paper";

  // Questions already in the paper may stay, even if they were rejected later.
  // Only questions that are newly added must be approved.
  const before = new Set<string>();
  for (const q of (previous.questions ?? []) as StoredQuestion[]) {
    for (const p of q.parts) {
      if (p.questionId) before.add(String(p.questionId));
      if (p.orQuestionId) before.add(String(p.orQuestionId));
    }
  }
  const added = ids.filter((id) => !before.has(id));
  if (added.length) {
    const ok = await questionsCol().countDocuments({
      _id: { $in: added.map((id) => new ObjectId(id)) },
      courseId,
      status: "approved",
    });
    if (ok !== added.length)
      return "Only approved questions of this course can be added to a paper";
  }
  return null;
}

// The paper with its questions filled in, the coverage and a list of problems.
// The export step uses this too, and refuses to export while "problems" is not empty.
export async function buildDetail(paper: WithId<Document>) {
  const questions = (paper.questions ?? []) as StoredQuestion[];

  const ids: ObjectId[] = [];
  for (const q of questions) {
    for (const p of q.parts) {
      if (p.questionId) ids.push(p.questionId);
      if (p.orQuestionId) ids.push(p.orQuestionId);
    }
  }

  const [docs, topics, clos] = await Promise.all([
    ids.length
      ? questionsCol()
          .find({ _id: { $in: ids } })
          .toArray()
      : Promise.resolve([] as WithId<Document>[]),
    topicsCol().find({ courseId: paper.courseId }).sort({ order: 1 }).toArray(),
    closCol().find({ courseId: paper.courseId }).sort({ number: 1 }).toArray(),
  ]);

  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const topicName = new Map(topics.map((t) => [String(t._id), String(t.name)]));

  const show = (id: ObjectId | null) => {
    const d = id ? byId.get(String(id)) : undefined;
    if (!d) return null;
    return {
      _id: d._id,
      type: d.type as "mcq" | "short" | "broad",
      text: String(d.text),
      options: (d.options ?? null) as string[] | null,
      correctIndex: (d.correctIndex ?? null) as number | null,
      answer: String(d.answer),
      difficulty: String(d.difficulty),
      bloom: String(d.bloom),
      cloId: String(d.cloId),
      cloCode: String(d.cloCode),
      topicId: String(d.topicId),
      topicName: topicName.get(String(d.topicId)) ?? null,
      status: String(d.status),
      sources: (d.sources ?? []) as { fileName: string; page: number }[],
    };
  };

  const problems: string[] = [];
  const topicMarks = new Map<string, number>();
  const cloMarks = new Map<string, number>();
  let totalMarks = 0;
  let filledMarks = 0;

  const filled = questions.map((q, qi) => ({
    parts: q.parts.map((p, pi) => {
      const label = slotLabel(qi, pi, q.parts.length);
      totalMarks += p.marks;
      const main = show(p.questionId);
      const alt = show(p.orQuestionId);

      if (!p.questionId) problems.push(`${label} has no question yet`);
      else if (!main) problems.push(`${label}: the question no longer exists`);
      else if (main.status !== "approved")
        problems.push(`${label}: the question is not approved any more`);

      if (p.orQuestionId) {
        if (!alt) problems.push(`${label} (Or): the question no longer exists`);
        else if (alt.status !== "approved")
          problems.push(`${label} (Or): the question is not approved any more`);
      }

      // Only the main question counts for the coverage. The "Or" choice replaces it, it does not add marks.
      if (main) {
        filledMarks += p.marks;
        topicMarks.set(
          main.topicId,
          (topicMarks.get(main.topicId) ?? 0) + p.marks,
        );
        cloMarks.set(main.cloId, (cloMarks.get(main.cloId) ?? 0) + p.marks);
      }
      return { marks: p.marks, question: main, orQuestion: alt };
    }),
  }));

  return {
    paper: {
      _id: paper._id,
      title: String(paper.title),
      program: String(paper.program ?? ""),
      batch: String(paper.batch ?? ""),
      semester: String(paper.semester ?? ""),
      durationMinutes: Number(paper.durationMinutes),
      instructions: String(paper.instructions ?? ""),
      coLabel: String(paper.coLabel ?? "CO"),
      totalMarks,
      createdAt: paper.createdAt,
      updatedAt: paper.updatedAt,
      questions: filled,
    },
    coverage: {
      totalMarks,
      filledMarks,
      topics: topics.map((t) => ({
        id: String(t._id),
        name: String(t.name),
        marks: topicMarks.get(String(t._id)) ?? 0,
      })),
      clos: clos.map((c) => ({
        id: String(c._id),
        code: String(c.code),
        marks: cloMarks.get(String(c._id)) ?? 0,
      })),
    },
    problems,
  };
}

// List the papers of a course, newest change first
papersRouter.get(
  "/:courseId/papers",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const list = await papersCol()
      .find({ courseId: course._id })
      .sort({ updatedAt: -1 })
      .toArray();

    res.json({
      papers: list.map((p) => {
        const slots = ((p.questions ?? []) as StoredQuestion[]).flatMap(
          (q) => q.parts,
        );
        return {
          _id: p._id,
          title: p.title,
          batch: p.batch,
          semester: p.semester,
          totalMarks: slots.reduce((sum, s) => sum + s.marks, 0),
          questionCount: (p.questions ?? []).length,
          slotCount: slots.length,
          filledCount: slots.filter((s) => s.questionId).length,
          updatedAt: p.updatedAt,
        };
      }),
    });
  },
);

// Create an empty paper with the given layout, for example [[2,3],[2,3]] is two questions with parts of 2 and 3 marks
papersRouter.post(
  "/:courseId/papers",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: firstIssue(parsed.error) });
    const d = parsed.data;

    const now = new Date();
    const doc = {
      courseId: course._id,
      title: d.title,
      program: d.program ?? "",
      batch: d.batch ?? "",
      semester: d.semester ?? "",
      durationMinutes: d.durationMinutes ?? 90,
      instructions: d.instructions ?? DEFAULT_INSTRUCTIONS,
      coLabel: d.coLabel ?? "CO",
      questions: d.layout.map((parts) => ({
        parts: parts.map((marks) => ({
          marks,
          questionId: null,
          orQuestionId: null,
        })),
      })),
      createdBy: new ObjectId(res.locals.user.id),
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await papersCol().insertOne(doc);
    res.status(201).json({ paper: { _id: inserted.insertedId } });
  },
);

// One paper, with its questions filled in, the coverage and the problems
papersRouter.get(
  "/:courseId/papers/:paperId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const paper = await loadPaper(course._id, String(req.params.paperId));
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    res.json(await buildDetail(paper));
  },
);

// Change the header and/or the questions of a paper. The whole question list is sent every time.
papersRouter.patch(
  "/:courseId/papers/:paperId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const paper = await loadPaper(course._id, String(req.params.paperId));
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: firstIssue(parsed.error) });
    const change = parsed.data;

    const set: Record<string, unknown> = {};
    for (const key of HEADER_KEYS) {
      if (change[key] !== undefined) set[key] = change[key];
    }

    if (change.questions) {
      const problem = await checkStructure(course._id, change.questions, paper);
      if (problem) return res.status(400).json({ error: problem });

      set.questions = change.questions.map((q) => ({
        parts: q.parts.map((p) => ({
          marks: p.marks,
          questionId: p.questionId ? new ObjectId(p.questionId) : null,
          orQuestionId: p.orQuestionId ? new ObjectId(p.orQuestionId) : null,
        })),
      }));
    }
    set.updatedAt = new Date();

    const updated = await papersCol().findOneAndUpdate(
      { _id: paper._id },
      { $set: set },
      { returnDocument: "after" },
    );
    if (!updated) return res.status(404).json({ error: "Paper not found" });

    res.json(await buildDetail(updated));
  },
);

// Delete a paper
papersRouter.delete(
  "/:courseId/papers/:paperId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const paperId = String(req.params.paperId);
    if (!ObjectId.isValid(paperId))
      return res.status(400).json({ error: "Invalid paper id" });

    const removed = await papersCol().deleteOne({
      _id: new ObjectId(paperId),
      courseId: course._id,
    });
    if (!removed.deletedCount)
      return res.status(404).json({ error: "Paper not found" });
    res.json({ ok: true });
  },
);
const exportSchema = z.object({
  format: z.enum(["docx", "pdf"]).default("docx"),
  kind: z.enum(["paper", "key"]).default("paper"),
});

// Makes a file name safe for a Content-Disposition header (RFC 5987)
const encodeName = (s: string) =>
  encodeURIComponent(s).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

// Download the paper (for the students) or the answer key (for the teacher).
// A paper with problems (empty places, questions that are not approved any more) is not exported.
papersRouter.get(
  "/:courseId/papers/:paperId/export",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const parsed = exportSchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          error: "format must be docx or pdf and kind must be paper or key",
        });
    }
    const { format, kind } = parsed.data;

    const paper = await loadPaper(course._id, String(req.params.paperId));
    if (!paper) return res.status(404).json({ error: "Paper not found" });

    const detail = await buildDetail(paper);
    if (detail.problems.length > 0) {
      return res.status(409).json({
        error: "Fix the problems of this paper before exporting it",
        problems: detail.problems,
      });
    }

    if (format !== "docx") {
      return res
        .status(400)
        .json({ error: "PDF export is added in the next step" });
    }

    try {
      const file = await renderDocx(detail, kind, {
        code: String(course.code),
        title: String(course.title),
      });

      const base = `${course.code} ${paper.title} ${kind === "key" ? "Answer key" : "Question paper"}`;
      const ascii =
        base
          .replace(/[^A-Za-z0-9 _-]+/g, "")
          .trim()
          .replace(/\s+/g, "_") || "question_paper";

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${ascii}.docx"; filename*=UTF-8''${encodeName(base)}.docx`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", String(file.length));
      res.send(file);
    } catch (err) {
      console.error("Word export failed:", err);
      res.status(500).json({ error: "Could not create the Word file" });
    }
  },
);
