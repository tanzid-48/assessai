import crypto from "node:crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { ObjectId, type Document, type WithId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { loadAssessment, stateOf } from "./assessments";

// The student side of an exam: list, start, autosave, tab events and submit.
// Everything about time and shuffling is decided here on the server, never trusted from the browser.
export const examsRouter = Router();
// The teacher side: who started, who finished and how often a tab was switched
export const examReportRouter = Router();

const assessmentsCol = () => getDB().collection("assessments");
const attemptsCol = () => getDB().collection("attempts");
const enrollmentsCol = () => getDB().collection("enrollments");
const coursesCol = () => getDB().collection("courses");
const usersCol = () => getDB().collection("user");

// A save that arrives a few seconds after the deadline is still accepted (slow network, last autosave)
const GRACE_MS = 5_000;

// Attempts of a timed exam are marked "formal". Other kinds of attempt (for example practice sessions)
// can share the same collection, but they never count as an exam and never block the AI tutor.
const MODE = "formal";

// The attempt of a student in one exam, or null
const findAttempt = (assessmentId: ObjectId, studentId: ObjectId) =>
  attemptsCol().findOne({ assessmentId, studentId, mode: MODE });

// What the server keeps for every question of an exam (a copy made when the exam was created)
type Snap = {
  type: "mcq" | "short" | "broad";
  text: string;
  options: string[] | null;
  cloCode: string;
};
type Item = {
  slot: string;
  number: number;
  part: string;
  marks: number;
  main: Snap;
  alt: Snap | null;
};
// An answer as it is stored. For multiple choice, optionIndex is the ORIGINAL option number, not the shuffled position.
type StoredAnswer = {
  selected?: "main" | "alt";
  text?: string;
  optionIndex?: number;
};

const answerSchema = z.object({
  selected: z.enum(["main", "alt"]).optional(),
  text: z.string().max(10_000).optional(),
  // The position of the option as the student sees it (0 to 3), or null to clear the choice
  choice: z.number().int().min(0).max(3).nullable().optional(),
});
const answersSchema = z
  .record(z.string().max(10), answerSchema)
  .refine((o) => Object.keys(o).length <= 60, {
    message: "Too many answers in one request",
  });
const saveSchema = z.object({ answers: answersSchema });
const submitSchema = z.object({ answers: answersSchema.optional() });
const eventSchema = z.object({
  type: z.enum(["hidden", "visible", "blur", "focus"]),
});

// One-time setup: a student can have only one exam attempt per exam, enforced by the database.
// The index is unique only for "formal" attempts, so other kinds of attempt are not affected.
export async function ensureAttemptIndexes() {
  // Exam attempts that were saved before the "mode" field existed are all formal ones
  await attemptsCol().updateMany(
    { mode: { $exists: false }, assessmentId: { $exists: true } },
    { $set: { mode: MODE } },
  );
  await attemptsCol().createIndex(
    { assessmentId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { mode: MODE } },
  );
}

// Attempts whose time ran out are closed as "submitted by time". Their answers stay as they were saved.
export async function sweepExpired() {
  await attemptsCol().updateMany(
    {
      mode: MODE,
      status: "in_progress",
      deadline: { $lt: new Date(Date.now() - GRACE_MS) },
    },
    [
      {
        $set: {
          status: "submitted",
          submitReason: "time",
          submittedAt: "$deadline",
        },
      },
    ],
  );
}

// Closes one attempt when its time has run out. Returns the attempt as it is now.
async function finalizeIfExpired(
  attempt: WithId<Document>,
): Promise<WithId<Document>> {
  if (attempt.status !== "in_progress") return attempt;
  if (Date.now() <= (attempt.deadline as Date).getTime() + GRACE_MS)
    return attempt;

  const closed = await attemptsCol().findOneAndUpdate(
    { _id: attempt._id, status: "in_progress" },
    {
      $set: {
        status: "submitted",
        submitReason: "time",
        submittedAt: attempt.deadline,
      },
    },
    { returnDocument: "after" },
  );
  return (
    closed ?? (await attemptsCol().findOne({ _id: attempt._id })) ?? attempt
  );
}

// The id of the exam a student is taking right now, or null
export async function hasActiveAttempt(studentId: ObjectId) {
  const found = await attemptsCol().findOne(
    {
      studentId,
      mode: MODE,
      status: "in_progress",
      deadline: { $gt: new Date(Date.now() - GRACE_MS) },
    },
    { projection: { assessmentId: 1 } },
  );
  return found ? String(found.assessmentId) : null;
}

// Put this in front of routes that must stay closed during an exam (the AI tutor, practice, feedback).
// It must run after requireRole, because it needs res.locals.user.
export async function blockDuringExam(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const examId = await hasActiveAttempt(new ObjectId(res.locals.user.id));
  if (examId) {
    return res.status(403).json({
      error: "This is not available while an exam is in progress",
      examId,
    });
  }
  next();
}

// A fair shuffle that uses the system's secure random numbers
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The exam, but only when the student is enrolled in its course. Others get "not found".
async function loadExamForStudent(idParam: string, studentId: ObjectId) {
  if (!ObjectId.isValid(idParam)) return null;
  const exam = await assessmentsCol().findOne({ _id: new ObjectId(idParam) });
  if (!exam) return null;
  const enrolled = await enrollmentsCol().findOne({
    courseId: exam.courseId,
    studentId,
  });
  return enrolled ? exam : null;
}

// A question as the student sees it: the text and the shuffled options, never the answer
function viewQuestion(
  q: Snap,
  key: string,
  optionOrder: Record<string, number[]>,
) {
  const options = q.options;
  return {
    type: q.type,
    text: q.text,
    cloCode: q.cloCode,
    options:
      q.type === "mcq" && options
        ? (optionOrder[key] ?? []).map((i) => options[i])
        : null,
  };
}

// Everything the student's exam page needs. The questions come in the student's own order.
function buildView(exam: Document, attempt: Document) {
  const items = exam.items as Item[];
  const bySlot = new Map(items.map((i) => [i.slot, i]));
  const order = attempt.order as string[];
  const optionOrder = (attempt.optionOrder ?? {}) as Record<string, number[]>;
  const answers = (attempt.answers ?? {}) as Record<string, StoredAnswer>;

  // The numbers follow the order the student sees, so the first question shown is always number 1
  const shown = order
    .map((slot) => bySlot.get(slot))
    .filter((i): i is Item => Boolean(i));
  const display = new Map<number, number>();
  for (const it of shown)
    if (!display.has(it.number)) display.set(it.number, display.size + 1);

  return {
    exam: {
      _id: exam._id,
      title: String(exam.title),
      durationMinutes: Number(exam.durationMinutes),
      totalMarks: Number(exam.totalMarks),
    },
    attempt: {
      status: String(attempt.status),
      startedAt: attempt.startedAt as Date,
      deadline: attempt.deadline as Date,
      submittedAt: (attempt.submittedAt ?? null) as Date | null,
      submitReason: (attempt.submitReason ?? null) as string | null,
    },
    items: shown.map((it) => ({
      slot: it.slot,
      label: `${display.get(it.number)}${it.part ? `(${it.part})` : ""}`,
      marks: it.marks,
      main: viewQuestion(it.main, `${it.slot}:main`, optionOrder),
      alt: it.alt ? viewQuestion(it.alt, `${it.slot}:alt`, optionOrder) : null,
    })),
    // The saved answers, with the choice given back as the position the student saw
    answers: Object.fromEntries(
      Object.entries(answers).map(([slot, a]) => {
        const which = a.selected ?? "main";
        const position =
          a.optionIndex !== undefined
            ? (optionOrder[`${slot}:${which}`] ?? []).indexOf(a.optionIndex)
            : -1;
        return [
          slot,
          {
            selected: which,
            text: a.text ?? "",
            choice: position >= 0 ? position : null,
          },
        ];
      }),
    ),
    serverNow: new Date(),
  };
}

// Turns the answers a student sent into database updates, after checking every one of them
function buildAnswerUpdate(
  exam: Document,
  attempt: Document,
  input: Record<string, z.infer<typeof answerSchema>>,
): { set: Record<string, unknown> } | { error: string } {
  const items = exam.items as Item[];
  const order = attempt.order as string[];
  const optionOrder = (attempt.optionOrder ?? {}) as Record<string, number[]>;
  const current = (attempt.answers ?? {}) as Record<string, StoredAnswer>;
  const set: Record<string, unknown> = {};

  for (const [slot, ans] of Object.entries(input)) {
    const item = items.find((i) => i.slot === slot);
    if (!item || !order.includes(slot))
      return { error: `Unknown question ${slot}` };

    const old = current[slot];
    const which = ans.selected ?? old?.selected ?? "main";
    const question = which === "alt" ? item.alt : item.main;
    if (!question) return { error: `Question ${slot} has no alternative` };

    // Switching between the main question and its alternative starts a fresh answer
    const next: StoredAnswer =
      which === (old?.selected ?? "main") ? { ...old } : {};
    next.selected = which;

    if (ans.text !== undefined) {
      if (question.type === "mcq")
        return { error: `Question ${slot} is multiple choice, send a choice` };
      next.text = ans.text;
    }
    if (ans.choice !== undefined) {
      if (question.type !== "mcq")
        return { error: `Question ${slot} is a written question, send text` };
      if (ans.choice === null) {
        delete next.optionIndex;
      } else {
        // The student sees shuffled options, so the position is translated back to the original option
        const original = optionOrder[`${slot}:${which}`]?.[ans.choice];
        if (original === undefined)
          return {
            error: `Option ${ans.choice} does not exist in question ${slot}`,
          };
        next.optionIndex = original;
      }
    }
    set[`answers.${slot}`] = next;
  }
  return { set };
}

// Only students can use the routes below
examsRouter.use(requireRole("student"));

// Test route that stands in for the AI tutor and the practice pages, which must stay closed during an exam.
// Remove it when the real routes use blockDuringExam.
examsRouter.get("/tutor-check", blockDuringExam, (_req, res) => {
  res.json({ ok: true, message: "The tutor is available" });
});

// The exams of the courses the student is enrolled in
examsRouter.get("/", async (_req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  await sweepExpired();

  const enrolls = await enrollmentsCol()
    .find({ studentId })
    .project({ courseId: 1 })
    .toArray();
  const courseIds = enrolls.map((e) => e.courseId as ObjectId);
  if (courseIds.length === 0)
    return res.json({ exams: [], serverNow: new Date() });

  const [list, courses] = await Promise.all([
    assessmentsCol()
      .find({ courseId: { $in: courseIds } })
      .sort({ startsAt: -1 })
      .project({ items: 0 })
      .toArray(),
    coursesCol()
      .find({ _id: { $in: courseIds } })
      .project({ code: 1, title: 1 })
      .toArray(),
  ]);

  const attempts = list.length
    ? await attemptsCol()
        .find({
          studentId,
          mode: MODE,
          assessmentId: { $in: list.map((a) => a._id) },
        })
        .project({ answers: 0, events: 0, order: 0, optionOrder: 0 })
        .toArray()
    : [];
  const attemptBy = new Map(attempts.map((t) => [String(t.assessmentId), t]));
  const courseBy = new Map(courses.map((c) => [String(c._id), c]));

  res.json({
    serverNow: new Date(),
    exams: list.map((a) => {
      const c = courseBy.get(String(a.courseId));
      const t = attemptBy.get(String(a._id));
      return {
        _id: a._id,
        title: a.title,
        courseCode: c?.code ?? "",
        courseTitle: c?.title ?? "",
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        durationMinutes: a.durationMinutes,
        totalMarks: a.totalMarks,
        itemCount: a.itemCount ?? 0,
        resultsPublished: Boolean(a.resultsPublished),
        state: stateOf({
          startsAt: a.startsAt as Date,
          endsAt: a.endsAt as Date,
        }),
        attempt: t
          ? {
              status: t.status,
              startedAt: t.startedAt,
              deadline: t.deadline,
              submittedAt: t.submittedAt ?? null,
            }
          : null,
      };
    }),
  });
});

// Start the exam. A student who already started gets the same attempt back (same order, same deadline).
examsRouter.post("/:examId/start", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const exam = await loadExamForStudent(String(req.params.examId), studentId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const existing = await findAttempt(exam._id, studentId);
  if (existing)
    return res.json(buildView(exam, await finalizeIfExpired(existing)));

  const startsAt = exam.startsAt as Date;
  const endsAt = exam.endsAt as Date;
  const state = stateOf({ startsAt, endsAt });
  if (state === "upcoming") {
    return res
      .status(409)
      .json({ error: "This exam has not started yet", state, startsAt });
  }
  if (state === "closed") {
    return res.status(409).json({ error: "This exam is closed", state });
  }

  const items = exam.items as Item[];

  // The numbered questions are shuffled. The parts of one question (a, b) always stay together and in order.
  const groups = [...new Set(items.map((i) => i.number))];
  const groupOrder = exam.shuffleQuestions ? shuffle(groups) : groups;
  const order = groupOrder.flatMap((n) =>
    items.filter((i) => i.number === n).map((i) => i.slot),
  );

  // Every multiple choice question gets its own order of options
  const optionOrder: Record<string, number[]> = {};
  for (const item of items) {
    for (const which of ["main", "alt"] as const) {
      const q = item[which];
      if (q && q.type === "mcq" && q.options) {
        const positions = q.options.map((_, i) => i);
        optionOrder[`${item.slot}:${which}`] = exam.shuffleOptions
          ? shuffle(positions)
          : positions;
      }
    }
  }

  // The deadline is fixed now, on the server: the exam time, but never later than the end of the open window
  const now = new Date();
  const deadline = new Date(
    Math.min(
      now.getTime() + Number(exam.durationMinutes) * 60_000,
      endsAt.getTime(),
    ),
  );

  try {
    // The filter fields (exam, student and mode) are part of the new attempt, so "mode" is saved as "formal"
    const created = await attemptsCol().findOneAndUpdate(
      { assessmentId: exam._id, studentId, mode: MODE },
      {
        $setOnInsert: {
          courseId: exam.courseId,
          startedAt: now,
          deadline,
          status: "in_progress",
          order,
          optionOrder,
          answers: {},
          events: [],
          tabSwitches: 0,
          savedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!created)
      return res.status(500).json({ error: "Could not start the exam" });
    res.status(201).json(buildView(exam, created));
  } catch (err) {
    // Two clicks at the same moment: the second one gets the attempt the first one made
    if ((err as { code?: number }).code === 11000) {
      const again = await findAttempt(exam._id, studentId);
      if (again) return res.json(buildView(exam, again));
    }
    throw err;
  }
});

// The student's own attempt (to continue after a reload)
examsRouter.get("/:examId/attempt", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const exam = await loadExamForStudent(String(req.params.examId), studentId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const found = await findAttempt(exam._id, studentId);
  if (!found)
    return res.status(404).json({ error: "You have not started this exam" });

  res.json(buildView(exam, await finalizeIfExpired(found)));
});

// Autosave. Only the answers that changed need to be sent.
examsRouter.put("/:examId/attempt/answers", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const exam = await loadExamForStudent(String(req.params.examId), studentId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const found = await findAttempt(exam._id, studentId);
  if (!found)
    return res.status(404).json({ error: "You have not started this exam" });

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Send the answers as { answers: { slot: { ... } } }" });

  const attempt = await finalizeIfExpired(found);
  if (attempt.status !== "in_progress") {
    return res.status(409).json({
      error:
        attempt.submitReason === "time"
          ? "Time is over, your answers were submitted"
          : "You have already submitted this exam",
    });
  }

  const update = buildAnswerUpdate(exam, attempt, parsed.data.answers);
  if ("error" in update) return res.status(400).json({ error: update.error });

  const now = new Date();
  const saved = await attemptsCol().updateOne(
    { _id: attempt._id, status: "in_progress" },
    { $set: { ...update.set, savedAt: now } },
  );
  if (!saved.matchedCount)
    return res.status(409).json({ error: "The exam is already finished" });

  res.json({
    ok: true,
    savedAt: now,
    deadline: attempt.deadline,
    serverNow: now,
  });
});

// The browser reports when the student leaves or returns to the exam tab. The time is the server's time.
examsRouter.post("/:examId/attempt/events", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const exam = await loadExamForStudent(String(req.params.examId), studentId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const found = await findAttempt(exam._id, studentId);
  if (!found)
    return res.status(404).json({ error: "You have not started this exam" });

  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Unknown event" });

  const attempt = await finalizeIfExpired(found);
  if (attempt.status !== "in_progress")
    return res.status(409).json({ error: "The exam is already finished" });

  // Only the last 500 events are kept. Leaving the tab (hidden) also counts as a tab switch.
  const update: Document = {
    $push: {
      events: {
        $each: [{ type: parsed.data.type, at: new Date() }],
        $slice: -500,
      },
    },
  };
  if (parsed.data.type === "hidden") update.$inc = { tabSwitches: 1 };

  const saved = await attemptsCol().updateOne(
    { _id: attempt._id, status: "in_progress" },
    update,
  );
  if (!saved.matchedCount)
    return res.status(409).json({ error: "The exam is already finished" });
  res.json({ ok: true });
});

// Hand in the exam. The last answers may be sent along. Handing in twice is harmless.
examsRouter.post("/:examId/attempt/submit", async (req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const exam = await loadExamForStudent(String(req.params.examId), studentId);
  if (!exam) return res.status(404).json({ error: "Exam not found" });

  const found = await findAttempt(exam._id, studentId);
  if (!found)
    return res.status(404).json({ error: "You have not started this exam" });

  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid answers" });

  if (found.status === "submitted") return res.json(buildView(exam, found));

  const inTime = Date.now() <= (found.deadline as Date).getTime() + GRACE_MS;
  let set: Record<string, unknown> = {};

  // Answers that come with the submit count only while there is still time
  if (inTime && parsed.data.answers) {
    const update = buildAnswerUpdate(exam, found, parsed.data.answers);
    if ("error" in update) return res.status(400).json({ error: update.error });
    set = update.set;
  }

  const closed = await attemptsCol().findOneAndUpdate(
    { _id: found._id, status: "in_progress" },
    {
      $set: {
        ...set,
        status: "submitted",
        submitReason: inTime ? "student" : "time",
        submittedAt: inTime ? new Date() : found.deadline,
      },
    },
    { returnDocument: "after" },
  );
  // If someone closed it a moment earlier, show the attempt as it is now
  const latest =
    closed ?? (await attemptsCol().findOne({ _id: found._id })) ?? found;
  res.json(buildView(exam, latest));
});

// For the teacher: every enrolled student with the state of their attempt and the tab switches
examReportRouter.get(
  "/:courseId/assessments/:assessmentId/attempts",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const exam = await loadAssessment(
      course._id,
      String(req.params.assessmentId),
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    await sweepExpired();

    const [attempts, enrolls] = await Promise.all([
      attemptsCol().find({ assessmentId: exam._id, mode: MODE }).toArray(),
      enrollmentsCol()
        .find({ courseId: course._id })
        .project({ studentId: 1 })
        .toArray(),
    ]);

    const ids = new Set<string>([
      ...enrolls.map((e) => String(e.studentId)),
      ...attempts.map((t) => String(t.studentId)),
    ]);
    const people = ids.size
      ? await usersCol()
          .find({ _id: { $in: [...ids].map((id) => new ObjectId(id)) } })
          .project({ name: 1, email: 1 })
          .toArray()
      : [];

    const attemptBy = new Map(attempts.map((t) => [String(t.studentId), t]));
    const total = Number(exam.itemCount ?? 0);

    const students = people
      .map((p) => {
        const t = attemptBy.get(String(p._id));
        const answers = (t?.answers ?? {}) as Record<string, StoredAnswer>;
        const answered = Object.values(answers).filter(
          (a) => (a.text ?? "").trim() !== "" || a.optionIndex !== undefined,
        ).length;
        return {
          studentId: String(p._id),
          name: String(p.name),
          email: String(p.email),
          status: t ? String(t.status) : "not_started",
          startedAt: t?.startedAt ?? null,
          submittedAt: t?.submittedAt ?? null,
          submitReason: t?.submitReason ?? null,
          tabSwitches: Number(t?.tabSwitches ?? 0),
          answered,
          total,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name));

    res.json({ assessmentId: exam._id, students });
  },
);
