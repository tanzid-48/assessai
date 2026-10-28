"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, TrendingUp } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ScoreBar from "@/components/ScoreBar";
import { api } from "@/lib/api";

type Topic = {
  topicId: string;
  topic: string;
  percent: number | null;
  practiceCorrect: number;
  practiceTotal: number;
  examEarned: number;
  examPossible: number;
  weak: boolean;
};
type Course = {
  courseId: string;
  code: string;
  title: string;
  practiceSessions: number;
  examsTaken: number;
  mcqAnswered: number;
  practicePercent: number | null;
  examPercent: number | null;
  topics: Topic[];
};

const show = (n: number | null) => (n === null ? "-" : `${n}%`);

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-950">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Progress() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ courses: Course[] }>("/api/progress")
      .then((d) => setCourses(d.courses))
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Could not load your progress",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My progress"
        description="Your score in every topic, from practice and from exams whose results are published. Topics below 70% are marked weak."
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900"
            />
          ))}
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          You are not enrolled in any course yet.
        </p>
      )}

      {courses.map((c) => {
        const weak = c.topics.filter((t) => t.weak);
        return (
          <section
            key={c.courseId}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
                  {c.code}
                </p>
                <h2 className="text-lg font-semibold">{c.title}</h2>
              </div>
              {weak.length > 0 && (
                <Link
                  href={`/student/practice?course=${c.courseId}&topic=${weak[0].topicId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <Target size={15} />
                  Practise my weak topics
                </Link>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Box label="Practice score" value={show(c.practicePercent)} />
              <Box label="Exam score" value={show(c.examPercent)} />
              <Box label="MCQs answered" value={String(c.mcqAnswered)} />
              <Box
                label="Practice sessions"
                value={String(c.practiceSessions)}
              />
              <Box label="Exams taken" value={String(c.examsTaken)} />
            </div>

            <div className="mt-5 space-y-3.5">
              {c.topics.length === 0 && (
                <p className="text-sm text-neutral-500">
                  This course has no topics yet.
                </p>
              )}
              {c.topics.map((t) => (
                <div key={t.topicId}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium">
                      {t.topic}
                      {t.weak && (
                        <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          Weak
                        </span>
                      )}
                    </p>
                    <p className="shrink-0 text-xs text-neutral-500">
                      {t.practiceTotal > 0 &&
                        `Practice ${t.practiceCorrect}/${t.practiceTotal}`}
                      {t.practiceTotal > 0 && t.examPossible > 0 && " · "}
                      {t.examPossible > 0 &&
                        `Exam ${t.examEarned}/${t.examPossible} marks`}
                    </p>
                  </div>
                  <ScoreBar percent={t.percent} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {!loading && courses.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <TrendingUp size={14} />
          Marks of an exam appear here only after your teacher has published the
          results.
        </p>
      )}
    </div>
  );
}

export default function StudentProgressPage() {
  return (
    <RoleGuard role="student">
      <Progress />
    </RoleGuard>
  );
}
