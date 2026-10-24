import { Router } from "express";
import { z } from "zod";
import { ObjectId, type Document } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { buildDetail, loadPaper } from "./papers";

// Assessments: a timed exam that students take, made from a finished question paper.
// The questions are copied into the assessment when it is created, so editing or deleting a question
// in the bank later never changes an exam that students may be taking.
export const assessmentsRouter = Router();

const assessmentsCol = () => getDB().collection("assessments");
const attemptsCol = () => getDB().collection("attempts");
const enrollmentsCol = () => getDB().collection("enrollments");

type Detail = Awaited<ReturnType<typeof buildDetail>>;
type DetailQuestion = NonNullable<
  Detail["paper"]["questions"][number]["parts"][number]["question"]
>;

const createSchema = z.object({
  paperId: z.string(),
  title: z.string().trim().min(3).max(120).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
});

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue
    ? `Invalid input, ${issue.path.join(".") || "request"}: ${issue.message}`
    : "Invalid input";
}

// upcoming: not open yet, open: students can start, closed: the window is over
export function stateOf(a: { startsAt: Date; endsAt: Date }, now = new Date()) {
  if (now.getTime() < a.startsAt.getTime()) return "upcoming";
  if (now.getTime() < a.endsAt.getTime()) return "open";
  return "closed";
}

// A copy of a question as it is when the exam is made. It keeps the answer, which only the teacher may see.
function snapshot(q: DetailQuestion) {
  return {
    questionId: q._id,
    type: q.type,
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    answer: q.answer,
    bloom: q.bloom,
    difficulty: q.difficulty,
    cloCode: q.cloCode,
    topicName: q.topicName,
    sources: q.sources,
  };
}

export async function loadAssessment(courseId: ObjectId, idParam: string) {
  if (!ObjectId.isValid(idParam)) return null;
  return assessmentsCol().findOne({ _id: new ObjectId(idParam), courseId });
}

// The fields every response shows (without the questions).
// It accepts a document that was loaded with or without the "items" list.
function describe(a: Document) {
  const startsAt = a.startsAt as Date;
  const endsAt = a.endsAt as Date;
  return {
    _id: a._id,
    paperId: a.paperId,
    title: String(a.title),
    durationMinutes: Number(a.durationMinutes),
    startsAt,
    endsAt,
    shuffleQuestions: Boolean(a.shuffleQuestions),
    shuffleOptions: Boolean(a.shuffleOptions),
    totalMarks: Number(a.totalMarks),
    itemCount: Number(
      a.itemCount ?? (Array.isArray(a.items) ? a.items.length : 0),
    ),
    state: stateOf({ startsAt, endsAt }),
    createdAt: a.createdAt as Date,
  };
}

// Create an exam from a finished paper
assessmentsRouter.post(
  "/:courseId/assessments",
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

    if (d.endsAt.getTime() <= d.startsAt.getTime()) {
      return res
        .status(400)
        .json({ error: "The end time must be after the start time" });
    }
    if (d.endsAt.getTime() <= Date.now() + 60_000) {
      return res
        .status(400)
        .json({ error: "The end time must be in the future" });
    }

    const paper = await loadPaper(course._id, d.paperId);
    if (!paper)
      return res.status(404).json({ error: "Paper not found in this course" });

    // Only a finished paper can become an exam
    const detail = await buildDetail(paper);
    if (detail.problems.length > 0) {
      return res.status(409).json({
        error: "Finish the paper before making an exam from it",
        problems: detail.problems,
      });
    }

    // The window must be long enough for the exam time, or students would be cut short
    const duration = d.durationMinutes ?? detail.paper.durationMinutes;
    const windowMinutes = Math.floor(
      (d.endsAt.getTime() - d.startsAt.getTime()) / 60_000,
    );
    if (windowMinutes < duration) {
      return res.status(400).json({
        error: `The open window (${windowMinutes} minutes) is shorter than the exam time (${duration} minutes)`,
      });
    }

    // Copy the questions. Slots are named 1a, 1b, 2a ... or just 1, 2 when a question has one part.
    const items = detail.paper.questions.flatMap((q, qi) =>
      q.parts.map((p, pi) => {
        const letter = q.parts.length > 1 ? String.fromCharCode(97 + pi) : "";
        return {
          slot: `${qi + 1}${letter}`,
          number: qi + 1,
          part: letter,
          marks: p.marks,
          main: snapshot(p.question as DetailQuestion),
          alt: p.orQuestion ? snapshot(p.orQuestion) : null,
        };
      }),
    );

    const doc = {
      courseId: course._id,
      paperId: paper._id,
      title: d.title ?? detail.paper.title,
      durationMinutes: duration,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      shuffleQuestions: d.shuffleQuestions,
      shuffleOptions: d.shuffleOptions,
      totalMarks: detail.paper.totalMarks,
      // Saved on its own, so lists can show it without loading all the questions
      itemCount: items.length,
      items,
      createdBy: new ObjectId(res.locals.user.id),
      createdAt: new Date(),
    };
    const inserted = await assessmentsCol().insertOne(doc);
    res.status(201).json({ assessment: { _id: inserted.insertedId } });
  },
);

// List the exams of a course, with how many students started and finished
assessmentsRouter.get(
  "/:courseId/assessments",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    // The questions are left out, they are long and the list does not need them
    const [list, enrolled] = await Promise.all([
      assessmentsCol()
        .find({ courseId: course._id })
        .sort({ startsAt: -1 })
        .project({ items: 0 })
        .toArray(),
      enrollmentsCol().countDocuments({ courseId: course._id }),
    ]);

    const ids = list.map((a) => a._id);
    const grouped = ids.length
      ? await attemptsCol()
          .aggregate([
            { $match: { assessmentId: { $in: ids } } },
            {
              $group: {
                _id: { a: "$assessmentId", s: "$status" },
                n: { $sum: 1 },
              },
            },
          ])
          .toArray()
      : [];

    const counts = new Map<string, { started: number; submitted: number }>();
    for (const g of grouped) {
      const key = String(g._id.a);
      const c = counts.get(key) ?? { started: 0, submitted: 0 };
      c.started += g.n as number;
      if (g._id.s === "submitted") c.submitted += g.n as number;
      counts.set(key, c);
    }

    res.json({
      assessments: list.map((a) => {
        const c = counts.get(String(a._id)) ?? { started: 0, submitted: 0 };
        return {
          ...describe(a),
          enrolled,
          started: c.started,
          submitted: c.submitted,
        };
      }),
    });
  },
);

// One exam with its copied questions and answers (for the teacher)
assessmentsRouter.get(
  "/:courseId/assessments/:assessmentId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const a = await loadAssessment(course._id, String(req.params.assessmentId));
    if (!a) return res.status(404).json({ error: "Exam not found" });

    res.json({ assessment: { ...describe(a), items: a.items } });
  },
);

// Delete an exam, but only while nobody has started it
assessmentsRouter.delete(
  "/:courseId/assessments/:assessmentId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const a = await loadAssessment(course._id, String(req.params.assessmentId));
    if (!a) return res.status(404).json({ error: "Exam not found" });

    const started = await attemptsCol().countDocuments({ assessmentId: a._id });
    if (started > 0) {
      return res
        .status(409)
        .json({
          error:
            "Students have already started this exam, so it cannot be deleted",
        });
    }

    await assessmentsCol().deleteOne({ _id: a._id });
    res.json({ ok: true });
  },
);
