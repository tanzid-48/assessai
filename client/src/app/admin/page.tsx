"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, GraduationCap, UserX, Users } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { api } from "@/lib/api";

type Course = {
  _id: string;
  code: string;
  title: string;
  teacherId?: string | null;
};
type UserRow = { id: string; name: string };

function AdminHome() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState(0);
  const [students, setStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load all numbers in parallel
  useEffect(() => {
    Promise.all([
      api<{ courses: Course[] }>("/api/courses"),
      api<{ users: UserRow[] }>("/api/users?role=teacher"),
      api<{ users: UserRow[] }>("/api/users?role=student"),
    ])
      .then(([c, t, s]) => {
        setCourses(c.courses);
        setTeachers(t.users.length);
        setStudents(s.users.length);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load data"),
      )
      .finally(() => setLoading(false));
  }, []);

  const show = (n: number) => (loading ? "–" : n);
  const unassigned = courses.filter((c) => !c.teacherId);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Courses, teachers and students at a glance."
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Courses"
          value={show(courses.length)}
          icon={BookOpen}
        />
        <StatCard label="Teachers" value={show(teachers)} icon={Users} />
        <StatCard
          label="Students"
          value={show(students)}
          icon={GraduationCap}
        />
        <StatCard
          label="Courses without a teacher"
          value={show(unassigned.length)}
          icon={UserX}
        />
      </div>

      {/* Things that need the admin's attention */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          <Link
            href="/admin/courses"
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Manage courses
          </Link>
        </div>

        {loading ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Loading...</p>
        ) : unassigned.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">
            All courses have a teacher assigned.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {unassigned.map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-neutral-500">{c.code}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  No teacher
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <RoleGuard role="admin">
      <AdminHome />
    </RoleGuard>
  );
}
