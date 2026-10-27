import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { ObjectId, type Document } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { blockDuringExam } from "./exams";
import { weakTopics } from "./progress";

// Practice: a student answers approved questions of a course at any time, as often as they like.
// The solution of a question is shown only after the student has answered it.
// Practice is closed while the student is taking an exam, decided here on the server.
export const practiceRouter = Router();
practiceRouter.use(requireRole("student"), blockDuringExam);

const enrollmentsCol = () => getDB().collection("enrollments");
const coursesCol = () => getDB().collection("courses");
const topicsCol = () => getDB().collection("topics");
const questionsCol = () => getDB().collection("questions");
// Practice sessions live in the same collection as exam attempts, told apart by mode
const sessionsCol = () => getDB().collection("attempts");

const MODE = "practice";

type Source = { fileName: string; page: number };
type PracticeItem = {
  slot: string;
  questionId: ObjectId;
  type: "mcq" | "short" | "broad";
  text: string;
  options: string[] | null;
  correctIndex: number | null;
  solution: string;
  topicName: string | null;
  cloCode: string;
  sources: Source[];
};
// A multiple choice answer keeps the ORIGINAL option number. A written answer keeps the text and is never marked.
type PracticeAnswer = {
  optionIndex?: number;
  correct?: boolean;
  text?: string;
  at: Date;
};

// A fair shuffle that uses the system's secure random numbers
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The course, but only when the student is enrolled in it
async function enrolledCourse(courseIdParam: string, studentId: ObjectId) {
  if (!ObjectId.isValid(courseIdParam)) return null;
  const courseId = new ObjectId(courseIdParam);
  const enrolled = await enrollmentsCol().findOne({ courseId, studentId });
  return enrolled ? coursesCol().findOne({ _id: courseId }) : null;
}

function loadSession(idParam: string, studentId: ObjectId) {
  if (!ObjectId.isValid(idParam)) return Promise.resolve(null);
  return sessionsCol().findOne({
    _id: new ObjectId(idParam),
    studentId,
    mode: MODE,
  });
}

function summaryOf(s: Document) {
  const items = s.items as PracticeItem[];
  const answers = (s.answers ?? {}) as Record<string, PracticeAnswer>;
  const mcq = items.filter((i) => i.type === "mcq");
  const mcqAnswered = mcq.filter((i) => answers[i.slot]).length;
  const correct = mcq.filter((i) => answers[i.slot]?.correct).length;
  const wrongTopics = [
    ...new Set(
      mcq
        .filter(
          (i) => answers[i.slot] && !answers[i.slot].correct && i.topicName,
        )
        .map((i) => i.topicName as string),
    ),
  ];
  return {
    total: items.length,
    answered: items.filter((i) => answers[i.slot]).length,
    mcqAnswered,
    correct,
    percent: mcqAnswered > 0 ? Math.round((correct / mcqAnswered) * 100) : null,
    wrongTopics,
  };
}

// What the student sees. The solution, the right option and the source pages appear only for answered questions.
function viewOf(s: Document) {
  const items = s.items as PracticeItem[];
  const order = (s.optionOrder ?? {}) as Record<string, number[]>;
  const answers = (s.answers ?? {}) as Record<string, PracticeAnswer>;

  return {
    sessionId: s._id,
    status: String(s.status),
    startedAt: s.startedAt as Date,
    summary: summaryOf(s),
    items: items.map((it, i) => {
      const options = it.options;
      const shown =
        it.type === "mcq" && options
          ? (order[it.slot] ?? []).map((k) => options[k])
          : null;
      const base = {
        slot: it.slot,
        number: i + 1,
        type: it.type,
        text: it.text,
        options: shown,
        topicName: it.topicName,
        cloCode: it.cloCode,
        answered: false as boolean,
      };

      const a = answers[it.slot];
      if (!a) return base;

      const positions = order[it.slot] ?? [];
      return {
        ...base,
        answered: true,
        yourChoice:
          a.optionIndex !== undefined ? positions.indexOf(a.optionIndex) : null,
        yourText: a.text ?? "",
        correct: a.correct ?? null,
        correctChoice:
          it.type === "mcq" && it.correctIndex !== null
            ? positions.indexOf(it.correctIndex)
            : null,
        solution: it.solution,
        sources: it.sources,
      };
    }),
  };
}

// The courses of the student with their topics, how many questions can be practised, and the weak topics
practiceRouter.get("/courses", async (_req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const enrolls = await enrollmentsCol()
    .find({ studentId })
    .project({ courseId: 1 })
    .toArray();
  const ids = enrolls.map((e) => e.courseId as ObjectId);
  if (ids.length === 0) return res.json({ courses: [] });

  const [courses, topics, counts] = await Promise.all([
    coursesCol()
      .find({ _id: { $in: ids } })
      .project({ code: 1, title: 1 })
      .sort({ code: 1 })
      .toArray(),
    topicsCol()
      .find({ courseId: { $in: ids } })
      .sort({ order: 1 })
      .toArray(),
    questionsCol()
      .aggregate([
        { $match: { courseId: { $in: ids }, status: "approved" } },
        { $group: { _id: { t: "$topicId", ty: "$type" }, n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const countBy = new Map<string, number>();
  for (const c of counts) countBy.set(`${c._id.t}:${c._id.ty}`, c.n as number);
  const weak = await Promise.all(
    courses.map((c) => weakTopics(studentId, c._id)),
  );

  res.json({
    courses: courses.map((c, i) => ({
      courseId: String(c._id),
      code: String(c.code),
      title: String(c.title),
      weak: weak[i],
      topics: topics
        .filter((t) => String(t.courseId) === String(c._id))
        .map((t) => ({
          topicId: String(t._id),
          name: String(t.name),
          mcq: countBy.get(`${t._id}:mcq`) ?? 0,
          short: countBy.get(`${t._id}:short`) ?? 0,
          broad: countBy.get(`${t._id}:broad`) ?? 0,
        })),
    })),
  });
});

const createSchema = z.object({
  courseId: z.string(),
  topicId: z.string().optional(),
  type: z.enum(["mcq", "short", "broad"]).default("mcq"),
  count: z.number().int().min(1).max(10).default(5),
  weakOnly: z.boolean().default(false),
});

// Start a practice session with random approved questions
practiceRouter.post("/sessions", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({
        error: "Choose a course, a question type and 1 to 10 questions",
      });
  const d = parsed.data;

  const course = await enrolledCourse(d.courseId, studentId);
  if (!course) return res.status(404).json({ error: "Course not found" });

  const filter: Document = {
    courseId: course._id,
    status: "approved",
    type: d.type,
  };

  if (d.topicId) {
    const topic = ObjectId.isValid(d.topicId)
      ? await topicsCol().findOne({
          _id: new ObjectId(d.topicId),
          courseId: course._id,
        })
      : null;
    if (!topic)
      return res.status(400).json({ error: "Topic not found in this course" });
    filter.topicId = topic._id;
  } else if (d.weakOnly) {
    // Only the topics in which the student scores low
    const weak = await weakTopics(studentId, course._id);
    if (weak.length === 0) {
      return res
        .status(409)
        .json({
          error:
            "You have no weak topics yet. Practise a few topics first, then come back.",
        });
    }
    const weakTopicDocs = await topicsCol()
      .find({ courseId: course._id, name: { $in: weak.map((w) => w.topic) } })
      .project({ _id: 1 })
      .toArray();
    filter.topicId = { $in: weakTopicDocs.map((t) => t._id) };
  }

  const picked = await questionsCol()
    .aggregate([{ $match: filter }, { $sample: { size: d.count } }])
    .toArray();
  if (picked.length === 0) {
    return res
      .status(409)
      .json({ error: "There are no approved questions for this choice yet." });
  }

  const topicDocs = await topicsCol()
    .find({ courseId: course._id })
    .project({ name: 1 })
    .toArray();
  const topicName = new Map(
    topicDocs.map((t) => [String(t._id), String(t.name)]),
  );

  const items: PracticeItem[] = picked.map((q, i) => ({
    slot: String(i + 1),
    questionId: q._id as ObjectId,
    type: q.type as PracticeItem["type"],
    text: String(q.text),
    options: (q.options ?? null) as string[] | null,
    correctIndex: (q.correctIndex ?? null) as number | null,
    solution: String(q.answer),
    topicName: topicName.get(String(q.topicId)) ?? null,
    cloCode: String(q.cloCode),
    sources: ((q.sources ?? []) as Source[]).map((s) => ({
      fileName: s.fileName,
      page: s.page,
    })),
  }));

  // Every multiple choice question gets its own order of options
  const optionOrder: Record<string, number[]> = {};
  for (const it of items) {
    if (it.type === "mcq" && it.options)
      optionOrder[it.slot] = shuffle(it.options.map((_, k) => k));
  }

  const doc = {
    studentId,
    courseId: course._id,
    mode: MODE,
    status: "in_progress",
    startedAt: new Date(),
    items,
    optionOrder,
    answers: {},
  };
  const inserted = await sessionsCol().insertOne(doc);
  res.status(201).json(viewOf({ _id: inserted.insertedId, ...doc }));
});

// A session of the student (to continue after a reload)
practiceRouter.get("/sessions/:id", async (req, res) => {
  const s = await loadSession(
    String(req.params.id),
    new ObjectId(res.locals.user.id),
  );
  if (!s) return res.status(404).json({ error: "Practice session not found" });
  res.json(viewOf(s));
});

const answerSchema = z.object({
  slot: z.string().max(10),
  choice: z.number().int().min(0).max(3).optional(),
  text: z.string().trim().min(1).max(5000).optional(),
});

// Answer one question. Each question can be answered once, and the solution comes back at once.
practiceRouter.post("/sessions/:id/answer", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const s = await loadSession(String(req.params.id), studentId);
  if (!s) return res.status(404).json({ error: "Practice session not found" });
  if (s.status !== "in_progress")
    return res.status(409).json({ error: "This practice session is finished" });

  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Send { slot, choice } or { slot, text }" });
  const { slot, choice, text } = parsed.data;

  const items = s.items as PracticeItem[];
  const it = items.find((i) => i.slot === slot);
  if (!it) return res.status(400).json({ error: "Unknown question" });

  const answer: PracticeAnswer = { at: new Date() };
  if (it.type === "mcq") {
    if (choice === undefined)
      return res.status(400).json({ error: "Choose an option" });
    // The student sees shuffled options, so the position is translated back to the original option
    const original = ((s.optionOrder ?? {}) as Record<string, number[]>)[
      slot
    ]?.[choice];
    if (original === undefined)
      return res.status(400).json({ error: "That option does not exist" });
    answer.optionIndex = original;
    answer.correct = original === it.correctIndex;
  } else {
    if (!text)
      return res.status(400).json({ error: "Write your answer first" });
    answer.text = text;
  }

  // Only a question that has no answer yet can be answered
  const saved = await sessionsCol().updateOne(
    {
      _id: s._id,
      status: "in_progress",
      [`answers.${slot}`]: { $exists: false },
    },
    { $set: { [`answers.${slot}`]: answer } },
  );
  if (!saved.matchedCount)
    return res
      .status(409)
      .json({ error: "You have already answered this question" });

  const fresh = await loadSession(String(s._id), studentId);
  const view = viewOf(fresh ?? s);
  res.json({
    item: view.items.find((i) => i.slot === slot),
    summary: view.summary,
  });
});

// Finish the session and see the summary. Finishing twice is harmless.
practiceRouter.post("/sessions/:id/finish", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const idParam = String(req.params.id);
  if (!ObjectId.isValid(idParam))
    return res.status(404).json({ error: "Practice session not found" });

  const closed = await sessionsCol().findOneAndUpdate(
    {
      _id: new ObjectId(idParam),
      studentId,
      mode: MODE,
      status: "in_progress",
    },
    { $set: { status: "finished", finishedAt: new Date() } },
    { returnDocument: "after" },
  );
  const s = closed ?? (await loadSession(idParam, studentId));
  if (!s) return res.status(404).json({ error: "Practice session not found" });
  res.json(viewOf(s));
});
