"use client";

import { useState } from "react";
import { Play, Target } from "lucide-react";
import {
  TYPE_LABEL,
  type CourseInfo,
  type QType,
  type StartBody,
} from "@/lib/practice";

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

type Props = {
  courses: CourseInfo[];
  initialCourseId?: string;
  initialTopicId?: string;
  busy: boolean;
  onStart: (body: StartBody) => void;
};

// The form for a new practice session: course, topic, type and number of questions
export default function PracticeSetup({
  courses,
  initialCourseId,
  initialTopicId,
  busy,
  onStart,
}: Props) {
  const firstId =
    courses.find((c) => c.courseId === initialCourseId)?.courseId ??
    courses[0]?.courseId ??
    "";
  const [courseId, setCourseId] = useState(firstId);
  const [topicId, setTopicId] = useState(() => {
    const course = courses.find((c) => c.courseId === firstId);
    return course?.topics.some((t) => t.topicId === initialTopicId)
      ? (initialTopicId as string)
      : "";
  });
  const [type, setType] = useState<QType>("mcq");
  const [count, setCount] = useState(5);

  const course = courses.find((c) => c.courseId === courseId);
  if (!course) return null;

  // How many questions of the chosen type can be practised in a topic (or in the whole course)
  const available = (t?: { mcq: number; short: number; broad: number }) =>
    t ? t[type] : course.topics.reduce((sum, x) => sum + x[type], 0);
  const topic = course.topics.find((t) => t.topicId === topicId);
  const total = available(topic);

  function changeCourse(id: string) {
    setCourseId(id);
    setTopicId("");
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Course</span>
          <select
            value={courseId}
            onChange={(e) => changeCourse(e.target.value)}
            className={`${fieldClass} mt-1.5`}
          >
            {courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.code} · {c.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Topic</span>
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className={`${fieldClass} mt-1.5`}
          >
            <option value="">All topics ({available()})</option>
            {course.topics.map((t) => (
              <option
                key={t.topicId}
                value={t.topicId}
                disabled={t[type] === 0}
              >
                {t.name} ({t[type]})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <span className="text-sm font-medium">Question type</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setTopicId("");
              }}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                type === t
                  ? "bg-white shadow-sm dark:bg-neutral-950"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {type !== "mcq" && (
          <p className="mt-2 text-xs text-neutral-500">
            Written answers are not marked. After you answer, you see the
            suggested answer and compare it with your own.
          </p>
        )}
      </div>

      <div className="mt-4 sm:max-w-xs">
        <label className="block">
          <span className="text-sm font-medium">Number of questions</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className={`${fieldClass} mt-1.5`}
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          disabled={busy || total === 0}
          onClick={() =>
            onStart({
              courseId,
              topicId: topicId || undefined,
              type,
              count,
              weakOnly: false,
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={16} />
          {busy ? "Starting..." : "Start practice"}
        </button>

        <button
          disabled={busy || course.weak.length === 0}
          onClick={() => onStart({ courseId, type, count, weakOnly: true })}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Target size={16} />
          My weak topics
        </button>
      </div>

      {total === 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          There are no approved {TYPE_LABEL[type].toLowerCase()} questions for
          this choice yet.
        </p>
      )}

      <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-xs dark:bg-neutral-950">
        {course.weak.length === 0 ? (
          <p className="text-neutral-500">
            Your weak topics appear here after you practise or an exam of yours
            is published.
          </p>
        ) : (
          <>
            <p className="font-medium">Your weak topics in this course</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {course.weak.map((w) => (
                <span
                  key={w.topic}
                  className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 dark:text-amber-400"
                >
                  {w.topic} · {w.percent}%
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
