"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ScoreBar from "@/components/ScoreBar";
import { api } from "@/lib/api";

type TopicRow = {
  topicId: string;
  topic: string;
  percent: number | null;
  answers: number;
  studentsWithData: number;
  weakStudents: number;
};
type StudentRow = {
  studentId: string;
  name: string;
  email: string;
  practiceAnswered: number;
  practicePercent: number | null;
  examPercent: number | null;
  percent: number | null;
  weakTopics: string[];
};
type Analytics = {
  course: { _id: string; code: string; title: string };
  weakBelow: number;
  activeStudents: number;
  hardest: { topic: string; percent: number } | null;
  topics: TopicRow[];
  students: StudentRow[];
};

const show = (n: number | null) => (n === null ? "-" : `${n}%`);

function Card({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-xs text-neutral-500">{note}</p>}
    </div>
  );
}

function AnalyticsView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Analytics>(`/api/courses/${id}/analytics`)
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Could not load the analytics",
        ),
      );
  }, [id]);

  const back = (
    <Link
      href={`/teacher/courses/${id}`}
      className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      <ArrowLeft size={15} /> Back to the course
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-64 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
    );
  }

  // Weakest first, topics without any score last
  const topics = [...data.topics].sort(
    (a, b) => (a.percent ?? 1000) - (b.percent ?? 1000),
  );
  const students = [...data.students].sort(
    (a, b) => (a.percent ?? 1000) - (b.percent ?? 1000),
  );
  const needHelp = students.filter(
    (s) => s.percent !== null && s.percent < data.weakBelow,
  ).length;

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title="Class analytics"
        description={`${data.course.code} · ${data.course.title}. Scores combine practice answers and published exams.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card
          label="Students with a score"
          value={`${data.activeStudents} of ${data.students.length}`}
          note={
            needHelp > 0 ? `${needHelp} below ${data.weakBelow}%` : undefined
          }
        />
        <Card
          label="Hardest topic"
          value={data.hardest ? data.hardest.topic : "-"}
          note={
            data.hardest
              ? `Class score ${data.hardest.percent}%`
              : "No scores yet"
          }
        />
        <Card label="Weak below" value={`${data.weakBelow}%`} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold">Topics</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          The hardest topics for the class come first.
        </p>
        <div className="mt-4 space-y-4">
          {topics.length === 0 && (
            <p className="text-sm text-neutral-500">
              This course has no topics yet.
            </p>
          )}
          {topics.map((t) => (
            <div key={t.topicId}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <p className="min-w-0 truncate text-sm font-medium">
                  {t.topic}
                </p>
                <p className="text-xs text-neutral-500">
                  {t.studentsWithData === 0
                    ? "No student has a score"
                    : `${t.weakStudents} of ${t.studentsWithData} students weak · ${t.answers} practice answers`}
                </p>
              </div>
              <ScoreBar percent={t.percent} weakBelow={data.weakBelow} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="p-5 pb-3">
          <h2 className="text-base font-semibold">Students</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Students who need help come first.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-y border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800">
                <th className="px-5 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Practice</th>
                <th className="px-3 py-2 font-medium">Exams</th>
                <th className="w-40 px-3 py-2 font-medium">Overall</th>
                <th className="px-5 py-2 font-medium">Weak topics</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-neutral-500"
                  >
                    No student is enrolled in this course yet.
                  </td>
                </tr>
              )}
              {students.map((s) => (
                <tr
                  key={s.studentId}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-neutral-500">{s.email}</p>
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {show(s.practicePercent)}
                    <span className="ml-1 text-xs text-neutral-500">
                      ({s.practiceAnswered})
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {show(s.examPercent)}
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBar percent={s.percent} weakBelow={data.weakBelow} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.weakTopics.length === 0 ? (
                        <span className="text-xs text-neutral-400">-</span>
                      ) : (
                        s.weakTopics.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                          >
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RoleGuard role="teacher">
      <AnalyticsView />
    </RoleGuard>
  );
}
