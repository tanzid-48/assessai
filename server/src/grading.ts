import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ObjectId, type Document } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";
import { loadAssessment } from "./assessments";

// Marking and publishing. Marks come from three places: the computer (multiple choice and blank answers),
// the AI (written answers, added in the next step) and the teacher. AI marks count only after the teacher
// approves them, and students see no marks until the teacher publishes the results of the exam.
export const gradingRouter = Router();
// The student's view of a published result
export const studentResultRouter = Router();

const assessmentsCol = () => getDB().collection("assessments");
const attemptsCol = () => getDB().collection("attempts");
const enrollmentsCol = () => getDB().collection("enrollments");
const usersCol = () => getDB().collection("user");

const MODE = "formal";

type Source = { fileName: string; page: number };
type Snap = {
  type: "mcq" | "short" | "broad";
  text: string;
  options: string[] | null;
  correctIndex: number | null;
  answer: string;
  cloCode: string;
  topicName: string | null;
  sources: Source[];
};
type Item = {
  slot: string;
  number: number;
  part: string;
  marks: number;
  main: Snap;
  alt: Snap | null;
};
// An answer as it is stored. For multiple choice, optionIndex is the ORIGINAL option number.
type StoredAnswer = {
  selected?: "main" | "alt";
  text?: string;
  optionIndex?: number;
};

export type Criterion = {
  text: string;
  max: number;
  awarded: number;
  justification: string;
};
// The marks of one part. awarded is null while the part still waits for marks.
export type Grade = {
  max: number;
  awarded: number | null;
  source: "auto" | "ai" | "teacher" | null;
  approved: boolean;
  feedback?: string;
  criteria?: Criterion[];
};

const labelOf = (i: Item) => `${i.number}${i.part ? `(${i.part})` : ""}`;

// The parts in the order of the paper: 1(a), 1(b), 2(a) ...
function sortItems(items: Item[]) {
  return [...items].sort(
    (a, b) => a.number - b.number || a.part.localeCompare(b.part),
  );
}

// The question the student really answered: the main one, or its alternative (Or)
function chosenQuestion(item: Item, answer?: StoredAnswer) {
  return answer?.selected === "alt" && item.alt ? item.alt : item.main;
}

// Marks that a computer can decide for sure: multiple choice, and answers that are blank
function autoGrade(item: Item, answer?: StoredAnswer): Grade | null {
  const q = chosenQuestion(item, answer);

  if (q.type === "mcq") {
    const answered = answer?.optionIndex !== undefined;
    const right = answered && answer?.optionIndex === q.correctIndex;
    return {
      max: item.marks,
      awarded: right ? item.marks : 0,
      source: "auto",
      approved: true,
      feedback: right ? "Correct" : answered ? "Incorrect" : "Not answered",
    };
  }
  if (!(answer?.text ?? "").trim()) {
    return {
      max: item.marks,
      awarded: 0,
      source: "auto",
      approved: true,
      feedback: "Not answered",
    };
  }
  // A written answer needs the AI or the teacher
  return null;
}

// The total so far, how many parts still wait for marks and how many AI marks wait for approval
function summarize(grades: Record<string, Grade>, items: Item[]) {
  let total = 0;
  let pending = 0;
  let unapproved = 0;
  for (const it of items) {
    const g = grades[it.slot];
    if (!g || g.awarded === null) {
      pending++;
      continue;
    }
    total += g.awarded;
    if (!g.approved) unapproved++;
  }
  return { total, pending, unapproved };
}

// The course and the exam of a teacher route. Sends the error answer itself and returns null on a problem.
async function context(req: Request, res: Response) {
  const result = await loadCourse(String(req.params.courseId), res.locals.user);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return null;
  }
  const exam = await loadAssessment(
    result.course._id,
    String(req.params.assessmentId),
  );
  if (!exam) {
    res.status(404).json({ error: "Exam not found" });
    return null;
  }
  return { course: result.course, exam };
}

function findAttempt(examId: ObjectId, studentIdParam: string) {
  if (!ObjectId.isValid(studentIdParam)) return Promise.resolve(null);
  return attemptsCol().findOne({
    assessmentId: examId,
    studentId: new ObjectId(studentIdParam),
    mode: MODE,
  });
}

const gradesOf = (attempt: Document) =>
  (attempt.result?.items ?? {}) as Record<string, Grade>;

// Mark everything that a computer can mark: multiple choice and blank answers.
// Marks from the AI or the teacher are never overwritten. Safe to run again.
gradingRouter.post(
  "/:courseId/assessments/:assessmentId/grade-auto",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { exam } = ctx;

    const items = exam.items as Item[];
    const attempts = await attemptsCol()
      .find({ assessmentId: exam._id, mode: MODE, status: "submitted" })
      .toArray();

    let waiting = 0;
    for (const t of attempts) {
      const answers = (t.answers ?? {}) as Record<string, StoredAnswer>;
      const grades = { ...gradesOf(t) };

      for (const item of items) {
        const old = grades[item.slot];
        if (old && (old.source === "ai" || old.source === "teacher")) continue;

        const auto = autoGrade(item, answers[item.slot]);
        grades[item.slot] = auto ?? {
          max: item.marks,
          awarded: null,
          source: null,
          approved: false,
        };
      }

      waiting += summarize(grades, items).pending;
      await attemptsCol().updateOne(
        { _id: t._id },
        { $set: { "result.items": grades, "result.updatedAt": new Date() } },
      );
    }

    res.json({ attempts: attempts.length, writtenAnswersWaiting: waiting });
  },
);

// Every enrolled student with the state of the marking
gradingRouter.get(
  "/:courseId/assessments/:assessmentId/results",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { course, exam } = ctx;
    const items = exam.items as Item[];

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

    const students = people
      .map((p) => {
        const t = attemptBy.get(String(p._id));
        const s =
          t?.status === "submitted" ? summarize(gradesOf(t), items) : null;
        return {
          studentId: String(p._id),
          name: String(p.name),
          email: String(p.email),
          status: t ? String(t.status) : "not_started",
          tabSwitches: Number(t?.tabSwitches ?? 0),
          total: s ? s.total : null,
          pending: s ? s.pending : 0,
          unapproved: s ? s.unapproved : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      published: Boolean(exam.resultsPublished),
      totalMarks: Number(exam.totalMarks),
      itemCount: items.length,
      students,
    });
  },
);

// One student's exam for marking: every part with the question, the answer, the correct answer and the marks
gradingRouter.get(
  "/:courseId/assessments/:assessmentId/attempts/:studentId",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { exam } = ctx;

    const attempt = await findAttempt(exam._id, String(req.params.studentId));
    if (!attempt)
      return res
        .status(404)
        .json({ error: "This student has no attempt in this exam" });

    const student = await usersCol().findOne(
      { _id: attempt.studentId },
      { projection: { name: 1, email: 1 } },
    );
    const items = sortItems(exam.items as Item[]);
    const answers = (attempt.answers ?? {}) as Record<string, StoredAnswer>;
    const grades = gradesOf(attempt);

    res.json({
      student: {
        id: String(attempt.studentId),
        name: String(student?.name ?? ""),
        email: String(student?.email ?? ""),
      },
      attempt: {
        status: String(attempt.status),
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt ?? null,
        submitReason: attempt.submitReason ?? null,
        tabSwitches: Number(attempt.tabSwitches ?? 0),
      },
      items: items.map((item) => {
        const a = answers[item.slot];
        const q = chosenQuestion(item, a);
        return {
          slot: item.slot,
          label: labelOf(item),
          marks: item.marks,
          chosen: a?.selected === "alt" && item.alt ? "alt" : "main",
          question: {
            type: q.type,
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            suggestedAnswer: q.answer,
            sources: q.sources,
            cloCode: q.cloCode,
            topicName: q.topicName,
          },
          answer: {
            text: a?.text ?? "",
            optionIndex: a?.optionIndex ?? null,
            optionText:
              q.type === "mcq" && a?.optionIndex !== undefined
                ? (q.options?.[a.optionIndex] ?? null)
                : null,
          },
          grade: grades[item.slot] ?? null,
        };
      }),
      summary: summarize(grades, items),
    });
  },
);

const marksSchema = z.object({
  items: z
    .record(
      z.string().max(10),
      z.object({
        awarded: z.number().min(0).multipleOf(0.5),
        feedback: z.string().trim().max(1000).optional(),
      }),
    )
    .refine((o) => Object.keys(o).length >= 1 && Object.keys(o).length <= 60, {
      message: "Send between 1 and 60 parts",
    }),
});

// The teacher sets or changes marks. Marks of the teacher count at once.
gradingRouter.patch(
  "/:courseId/assessments/:assessmentId/attempts/:studentId/marks",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { exam } = ctx;

    const attempt = await findAttempt(exam._id, String(req.params.studentId));
    if (!attempt)
      return res
        .status(404)
        .json({ error: "This student has no attempt in this exam" });
    if (attempt.status !== "submitted")
      return res
        .status(409)
        .json({ error: "The student has not handed in yet" });

    const parsed = marksSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          error:
            "Send { items: { slot: { awarded, feedback } } } with marks in steps of 0.5",
        });
    }

    const items = exam.items as Item[];
    const grades = gradesOf(attempt);
    const set: Record<string, unknown> = {};

    for (const [slot, m] of Object.entries(parsed.data.items)) {
      const item = items.find((i) => i.slot === slot);
      if (!item)
        return res.status(400).json({ error: `Unknown question ${slot}` });
      if (m.awarded > item.marks) {
        return res
          .status(400)
          .json({
            error: `Marks for ${labelOf(item)} cannot be more than ${item.marks}`,
          });
      }

      const old = grades[slot];
      const grade: Grade = {
        max: item.marks,
        awarded: m.awarded,
        source: "teacher",
        approved: true,
      };
      const feedback = m.feedback ?? old?.feedback;
      if (feedback) grade.feedback = feedback;
      if (old?.criteria) grade.criteria = old.criteria;
      set[`result.items.${slot}`] = grade;
    }

    await attemptsCol().updateOne(
      { _id: attempt._id },
      { $set: { ...set, "result.updatedAt": new Date() } },
    );
    const fresh = await attemptsCol().findOne({ _id: attempt._id });
    res.json({
      ok: true,
      summary: summarize(fresh ? gradesOf(fresh) : {}, items),
    });
  },
);

const approveSchema = z.object({ studentId: z.string().optional() });

// The teacher approves the AI marks of one student, or of everybody
gradingRouter.post(
  "/:courseId/assessments/:assessmentId/approve",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { exam } = ctx;

    const parsed = approveSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid request" });

    const filter: Document = {
      assessmentId: exam._id,
      mode: MODE,
      status: "submitted",
    };
    if (parsed.data.studentId) {
      if (!ObjectId.isValid(parsed.data.studentId))
        return res.status(400).json({ error: "Invalid student" });
      filter.studentId = new ObjectId(parsed.data.studentId);
    }

    const attempts = await attemptsCol().find(filter).toArray();
    let approved = 0;

    for (const t of attempts) {
      const set: Record<string, unknown> = {};
      for (const [slot, g] of Object.entries(gradesOf(t))) {
        if (g.source === "ai" && g.awarded !== null && !g.approved) {
          set[`result.items.${slot}.approved`] = true;
          approved++;
        }
      }
      if (Object.keys(set).length > 0)
        await attemptsCol().updateOne({ _id: t._id }, { $set: set });
    }

    res.json({ approved });
  },
);

const publishSchema = z.object({ published: z.boolean() });

// Publish the results (students can see their marks) or take them back.
// Publishing needs every part of every handed-in exam to have marks, and every AI mark to be approved.
gradingRouter.post(
  "/:courseId/assessments/:assessmentId/publish",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    const { exam } = ctx;

    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Send { published: true } or { published: false }" });
    const { published } = parsed.data;

    if (published) {
      const items = exam.items as Item[];
      const attempts = await attemptsCol()
        .find({ assessmentId: exam._id, mode: MODE, status: "submitted" })
        .toArray();
      if (attempts.length === 0)
        return res
          .status(409)
          .json({ error: "Nobody has handed in this exam yet" });

      const blockers: {
        studentId: string;
        pending: number;
        unapproved: number;
      }[] = [];
      for (const t of attempts) {
        const s = summarize(gradesOf(t), items);
        if (s.pending > 0 || s.unapproved > 0) {
          blockers.push({
            studentId: String(t.studentId),
            pending: s.pending,
            unapproved: s.unapproved,
          });
        }
      }
      if (blockers.length > 0) {
        return res.status(409).json({
          error:
            "Every part needs marks, and every AI mark must be approved, before the results can be published",
          blockers,
        });
      }
    }

    await assessmentsCol().updateOne(
      { _id: exam._id },
      {
        $set: {
          resultsPublished: published,
          resultsPublishedAt: published ? new Date() : null,
        },
      },
    );
    res.json({ ok: true, published });
  },
);

// The student's own result. It exists only after the teacher has published the results.
studentResultRouter.get(
  "/:examId/result",
  requireRole("student"),
  async (req, res) => {
    const studentId = new ObjectId(res.locals.user.id);
    const idParam = String(req.params.examId);
    if (!ObjectId.isValid(idParam))
      return res.status(404).json({ error: "Exam not found" });

    const exam = await assessmentsCol().findOne({ _id: new ObjectId(idParam) });
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Only students of the course can see anything about the exam
    const enrolled = await enrollmentsCol().findOne({
      courseId: exam.courseId,
      studentId,
    });
    if (!enrolled) return res.status(404).json({ error: "Exam not found" });

    if (!exam.resultsPublished)
      return res
        .status(409)
        .json({ error: "Your marks have not been published yet" });

    const attempt = await attemptsCol().findOne({
      assessmentId: exam._id,
      studentId,
      mode: MODE,
      status: "submitted",
    });
    if (!attempt)
      return res.status(404).json({ error: "You did not hand in this exam" });

    const items = sortItems(exam.items as Item[]);
    const grades = gradesOf(attempt);
    const s = summarize(grades, items);
    // An exam handed in after the publishing, or one that was not marked completely, shows nothing
    if (s.pending > 0 || s.unapproved > 0)
      return res
        .status(409)
        .json({ error: "Your exam has not been marked yet" });

    const answers = (attempt.answers ?? {}) as Record<string, StoredAnswer>;
    res.json({
      exam: { _id: exam._id, title: String(exam.title) },
      total: s.total,
      totalMarks: Number(exam.totalMarks),
      items: items.map((item) => {
        const a = answers[item.slot];
        const q = chosenQuestion(item, a);
        const g = grades[item.slot];
        return {
          slot: item.slot,
          label: labelOf(item),
          marks: item.marks,
          awarded: g.awarded,
          feedback: g.feedback ?? "",
          criteria: g.criteria ?? [],
          question: {
            type: q.type,
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            suggestedAnswer: q.answer,
            sources: q.sources,
            cloCode: q.cloCode,
            topicName: q.topicName,
          },
          yourAnswer: {
            text: a?.text ?? "",
            optionIndex: a?.optionIndex ?? null,
          },
        };
      }),
    });
  },
);
