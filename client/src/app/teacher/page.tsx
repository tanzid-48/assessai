"use client";

import { useEffect, useState } from "react";
import { BookOpen, GraduationCap } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import CourseCard from "@/components/CourseCard";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

type Course = { _id: string; code: string; title: string; credits: number };

// The teacher's workflow, shown as a vertical guide on the right
const STEPS = [
  { title: "Upload materials", text: "Add slides and notes to each course." },
  {
    title: "Generate questions",
    text: "AI drafts questions with source references.",
  },
  {
    title: "Review and approve",
    text: "Edit questions and build the question bank.",
  },
  { title: "Run assessments", text: "Timed exams with integrity checks." },
  {
    title: "Moderate marks",
    text: "AI marks are published only after you approve.",
  },
];

function TeacherHome() {
  const { data: session } = authClient.useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The server returns only the courses assigned to this teacher
  useEffect(() => {
    api<{ courses: Course[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load courses"),
      )
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
    const totalCredits = courses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${session?.user.name ?? ""}`}
        description={today}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: stats and courses */}
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="My courses"
              value={courses.length}
              icon={BookOpen}
            />
            <StatCard
              label="Total credits"
              value={totalCredits}
              icon={GraduationCap}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <section>
            <h2 className="text-sm font-semibold">My courses</h2>

            <div className="mt-3">
              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
                    />
                  ))}
                </div>
              ) : courses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                    <BookOpen size={18} />
                  </div>
                  <p className="mt-3 text-sm font-medium">
                    No courses assigned yet
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Courses assigned by the admin will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {courses.map((c) => (
                    <CourseCard
                      key={c._id}
                      code={c.code}
                      title={c.title}
                      credits={c.credits}
                      href={`/teacher/courses/${c._id}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right: workflow guide */}
        <aside className="self-start rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold">Your workflow</h2>
          <p className="mt-1 text-xs text-neutral-500">
            From course material to published marks.
          </p>

          <ol className="mt-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                  )}
                </div>
                <div className={i < STEPS.length - 1 ? "pb-5" : ""}>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}

export default function TeacherPage() {
  return (
    <RoleGuard role="teacher">
      <TeacherHome />
    </RoleGuard>
  );
}
