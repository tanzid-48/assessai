"use client";

import { useEffect, useState } from "react";
import RoleGuard from "@/components/RoleGuard";
import StatCard from "@/components/StatCard";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { gradientFor, prefixFor } from "@/lib/courseStyle";

type Course = { _id: string; code: string; title: string; credits: number };

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

  const firstName = session?.user.name.split(" ")[0] ?? "";
  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);

  return (
    <>
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 text-white shadow-lg shadow-indigo-600/20 md:p-8">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <p className="relative text-sm text-white/80">Teacher dashboard</p>
        <h2 className="relative mt-1 text-2xl font-bold md:text-3xl">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="relative mt-2 max-w-xl text-sm text-white/80">
          Upload course materials, generate questions and moderate marks for
          your courses.
        </p>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="My courses"
          value={courses.length}
          gradient="from-indigo-500 to-violet-500"
          icon="📚"
        />
        <StatCard
          label="Total credits"
          value={totalCredits}
          gradient="from-emerald-500 to-teal-500"
          icon="🎓"
        />
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* My courses */}
      <h3 className="mt-8 text-lg font-semibold">My courses</h3>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-medium">No courses assigned yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              The admin will assign courses to you. They will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => {
              const gradient = gradientFor(c.code);
              return (
                <div
                  key={c._id}
                  className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`}
                  />

                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${gradient}`}
                    >
                      {prefixFor(c.code)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {c.code}
                      </p>
                      <p className="mt-0.5 font-semibold leading-snug">
                        {c.title}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-4 text-xs dark:border-neutral-800">
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium dark:bg-neutral-800">
                      {c.credits} credits
                    </span>
                    {/* Becomes a real link when the materials page is built */}
                    <span className="flex items-center gap-2 text-neutral-400 dark:text-neutral-600">
                      Materials
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide dark:bg-neutral-800">
                        Soon
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
