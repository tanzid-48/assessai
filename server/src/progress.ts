import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "./db";
import { requireRole } from "./middleware";
import { loadCourse } from "./outline";

// Progress of students and analytics for teachers.
// The numbers come from two places: practice sessions (multiple choice answers, 1 point each)
// and exams whose results are published and completely marked (the marks of every part).
export const progressRouter = Router();
export const analyticsRouter = Router();

const attemptsCol = () => getDB().collection("attempts");
const assessmentsCol = () => getDB().collection("assessments");
const enrollmentsCol = () => getDB().collection("enrollments");
const coursesCol = () => getDB().collection("courses");
const topicsCol = () => getDB().collection("topics");
const usersCol = () => getDB().collection("user");

// A topic with a score below this is called weak
export const WEAK_BELOW = 70;

type Row = {
  studentId: string;
  courseId: string;
  topic: string;
  kind: "practice" | "exam";
  earned: number;
  possible: number;
};
export type Stat = {
  practiceCorrect: number;
  practiceTotal: number;
  examEarned: number;
  examPossible: number;
};

const emptyStat = (): Stat => ({
  practiceCorrect: 0,
  practiceTotal: 0,
  examEarned: 0,
  examPossible: 0,
});

function addRow(stat: Stat, row: Row) {
  if (row.kind === "practice") {
    stat.practiceCorrect += row.earned;
    stat.practiceTotal += row.possible;
  } else {
    stat.examEarned += row.earned;
    stat.examPossible += row.possible;
  }
}

// The score of a topic from 0 to 100: the average of the practice accuracy and the exam percentage that exist
export function percentOf(s: Stat): number | null {
  const parts: number[] = [];
  if (s.practiceTotal > 0) parts.push(s.practiceCorrect / s.practiceTotal);
  if (s.examPossible > 0) parts.push(s.examEarned / s.examPossible);
  if (parts.length === 0) return null;
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

const pct = (earned: number, possible: number) =>
  possible > 0 ? Math.round((earned / possible) * 100) : null;

type PracticeItem = { slot: string; type: string; topicName: string | null };
type ExamItem = {
  slot: string;
  main: { topicName: string | null };
  alt: { topicName: string | null } | null;
};
type Grade = { awarded: number | null; max: number; approved: boolean };

// All the scored answers of one student, one course or everybody, as simple rows
async function collectRows(match: {
  studentId?: ObjectId;
  courseId?: ObjectId;
}): Promise<Row[]> {
  const rows: Row[] = [];

  // 1. Practice: every answered multiple choice question is worth one point
  const practice = await attemptsCol()
    .find({ mode: "practice", ...match })
    .project({ studentId: 1, courseId: 1, items: 1, answers: 1 })
    .toArray();

  for (const s of practice) {
    const answers = (s.answers ?? {}) as Record<string, { correct?: boolean }>;
    for (const it of (s.items ?? []) as PracticeItem[]) {
      const a = answers[it.slot];
      if (!a || it.type !== "mcq" || a.correct === undefined || !it.topicName)
        continue;
      rows.push({
        studentId: String(s.studentId),
        courseId: String(s.courseId),
        topic: it.topicName,
        kind: "practice",
        earned: a.correct ? 1 : 0,
        possible: 1,
      });
    }
  }

  // 2. Exams: only when the teacher has published the results and every part has approved marks
  const formal = await attemptsCol()
    .find({ mode: "formal", status: "submitted", ...match })
    .project({
      studentId: 1,
      courseId: 1,
      assessmentId: 1,
      answers: 1,
      result: 1,
    })
    .toArray();

  const examIds = [...new Set(formal.map((f) => String(f.assessmentId)))].map(
    (id) => new ObjectId(id),
  );
  const exams = examIds.length
    ? await assessmentsCol()
        .find({ _id: { $in: examIds }, resultsPublished: true })
        .project({ items: 1 })
        .toArray()
    : [];
  const examBy = new Map(exams.map((e) => [String(e._id), e]));

  for (const t of formal) {
    const exam = examBy.get(String(t.assessmentId));
    if (!exam) continue;

    const items = exam.items as ExamItem[];
    const grades = (t.result?.items ?? {}) as Record<string, Grade>;
    const complete = items.every((i) => {
      const g = grades[i.slot];
      return g && g.awarded !== null && g.approved;
    });
    if (!complete) continue;

    const answers = (t.answers ?? {}) as Record<
      string,
      { selected?: "main" | "alt" }
    >;
    for (const it of items) {
      const g = grades[it.slot];
      const q =
        answers[it.slot]?.selected === "alt" && it.alt ? it.alt : it.main;
      if (!q.topicName) continue;
      rows.push({
        studentId: String(t.studentId),
        courseId: String(t.courseId),
        topic: q.topicName,
        kind: "exam",
        earned: g.awarded as number,
        possible: g.max,
      });
    }
  }
  return rows;
}

// The topics of a course in which the student scores below WEAK_BELOW, weakest first
export async function weakTopics(studentId: ObjectId, courseId: ObjectId) {
  const rows = await collectRows({ studentId, courseId });
  const byTopic = new Map<string, Stat>();
  for (const r of rows) {
    const s = byTopic.get(r.topic) ?? emptyStat();
    addRow(s, r);
    byTopic.set(r.topic, s);
  }
  return [...byTopic]
    .map(([topic, stat]) => ({ topic, percent: percentOf(stat) }))
    .filter(
      (t): t is { topic: string; percent: number } =>
        t.percent !== null && t.percent < WEAK_BELOW,
    )
    .sort((a, b) => a.percent - b.percent);
}

// The progress of the logged-in student in every course they are enrolled in
progressRouter.get("/", requireRole("student"), async (_req, res) => {
  const studentId = new ObjectId(res.locals.user.id);
  const enrolls = await enrollmentsCol()
    .find({ studentId })
    .project({ courseId: 1 })
    .toArray();
  const courseIds = enrolls.map((e) => e.courseId as ObjectId);
  if (courseIds.length === 0) return res.json({ courses: [] });

  const [courses, topics, rows, sessions, exams] = await Promise.all([
    coursesCol()
      .find({ _id: { $in: courseIds } })
      .project({ code: 1, title: 1 })
      .sort({ code: 1 })
      .toArray(),
    topicsCol()
      .find({ courseId: { $in: courseIds } })
      .sort({ order: 1 })
      .toArray(),
    collectRows({ studentId }),
    attemptsCol()
      .aggregate([
        { $match: { studentId, mode: "practice" } },
        { $group: { _id: "$courseId", n: { $sum: 1 } } },
      ])
      .toArray(),
    attemptsCol()
      .aggregate([
        { $match: { studentId, mode: "formal", status: "submitted" } },
        { $group: { _id: "$courseId", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const sessionsBy = new Map(
    sessions.map((g) => [String(g._id), g.n as number]),
  );
  const examsBy = new Map(exams.map((g) => [String(g._id), g.n as number]));

  res.json({
    courses: courses.map((c) => {
      const cid = String(c._id);
      const mine = rows.filter((r) => r.courseId === cid);
      const all = emptyStat();
      for (const r of mine) addRow(all, r);

      const list = topics
        .filter((t) => String(t.courseId) === cid)
        .map((t) => {
          const stat = emptyStat();
          for (const r of mine) if (r.topic === t.name) addRow(stat, r);
          const percent = percentOf(stat);
          return {
            topicId: String(t._id),
            topic: String(t.name),
            percent,
            ...stat,
            weak: percent !== null && percent < WEAK_BELOW,
          };
        })
        // Weakest first, topics without any score last
        .sort((a, b) => (a.percent ?? 1000) - (b.percent ?? 1000));

      return {
        courseId: cid,
        code: String(c.code),
        title: String(c.title),
        practiceSessions: sessionsBy.get(cid) ?? 0,
        examsTaken: examsBy.get(cid) ?? 0,
        mcqAnswered: all.practiceTotal,
        practicePercent: pct(all.practiceCorrect, all.practiceTotal),
        examPercent: pct(all.examEarned, all.examPossible),
        topics: list,
      };
    }),
  });
});

// For the teacher: how the class is doing, topic by topic and student by student
analyticsRouter.get(
  "/:courseId/analytics",
  requireRole("admin", "teacher"),
  async (req, res) => {
    const result = await loadCourse(
      String(req.params.courseId),
      res.locals.user,
    );
    if ("error" in result)
      return res.status(result.status).json({ error: result.error });
    const { course } = result;

    const [rows, enrolls, topics] = await Promise.all([
      collectRows({ courseId: course._id }),
      enrollmentsCol()
        .find({ courseId: course._id })
        .project({ studentId: 1 })
        .toArray(),
      topicsCol().find({ courseId: course._id }).sort({ order: 1 }).toArray(),
    ]);

    const ids = enrolls.map((e) => e.studentId as ObjectId);
    const people = ids.length
      ? await usersCol()
          .find({ _id: { $in: ids } })
          .project({ name: 1, email: 1 })
          .toArray()
      : [];

    // The scores of every student overall, and of every student in every topic
    const overall = new Map<string, Stat>();
    const perTopic = new Map<string, Map<string, Stat>>();
    for (const r of rows) {
      const o = overall.get(r.studentId) ?? emptyStat();
      addRow(o, r);
      overall.set(r.studentId, o);

      const byStudent = perTopic.get(r.topic) ?? new Map<string, Stat>();
      const s = byStudent.get(r.studentId) ?? emptyStat();
      addRow(s, r);
      byStudent.set(r.studentId, s);
      perTopic.set(r.topic, byStudent);
    }

    // Every topic: the score of the whole class and how many students are weak in it
    const topicList = topics.map((t) => {
      const name = String(t.name);
      const students = perTopic.get(name) ?? new Map<string, Stat>();
      const all = emptyStat();
      let weakStudents = 0;
      for (const s of students.values()) {
        all.practiceCorrect += s.practiceCorrect;
        all.practiceTotal += s.practiceTotal;
        all.examEarned += s.examEarned;
        all.examPossible += s.examPossible;
        const p = percentOf(s);
        if (p !== null && p < WEAK_BELOW) weakStudents++;
      }
      return {
        topicId: String(t._id),
        topic: name,
        percent: percentOf(all),
        answers: all.practiceTotal,
        studentsWithData: students.size,
        weakStudents,
      };
    });

    // Every enrolled student with the topics in which they are weak
    const studentList = people
      .map((p) => {
        const id = String(p._id);
        const stat = overall.get(id) ?? emptyStat();
        const weak = [...perTopic]
          .filter(([, byStudent]) => {
            const s = byStudent.get(id);
            const percent = s ? percentOf(s) : null;
            return percent !== null && percent < WEAK_BELOW;
          })
          .map(([name]) => name);

        return {
          studentId: id,
          name: String(p.name),
          email: String(p.email),
          practiceAnswered: stat.practiceTotal,
          practicePercent: pct(stat.practiceCorrect, stat.practiceTotal),
          examPercent: pct(stat.examEarned, stat.examPossible),
          percent: percentOf(stat),
          weakTopics: weak,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const scored = topicList.filter((t) => t.percent !== null);
    const hardest = scored.length
      ? [...scored].sort(
          (a, b) => (a.percent as number) - (b.percent as number),
        )[0]
      : null;

    res.json({
      course: {
        _id: course._id,
        code: String(course.code),
        title: String(course.title),
      },
      weakBelow: WEAK_BELOW,
      activeStudents: studentList.filter((s) => s.percent !== null).length,
      hardest: hardest
        ? { topic: hardest.topic, percent: hardest.percent }
        : null,
      topics: topicList,
      students: studentList,
    });
  },
);
