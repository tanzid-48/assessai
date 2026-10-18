"use client";

import { useEffect, useMemo, useState } from "react";
import RoleGuard from "@/components/RoleGuard";
import { api } from "@/lib/api";

type Course = {
  _id: string;
  code: string;
  title: string;
  credits: number;
  teacherId?: string | null;
};

// Gradient pairs for the course icons. The course code decides which one is used,
// so a course always keeps the same colour.
const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];

function gradientFor(code: string) {
  let sum = 0;
  for (const ch of code) sum += ch.charCodeAt(0);
  return GRADIENTS[sum % GRADIENTS.length];
}

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

function StatCard({
  label,
  value,
  gradient,
  icon,
}: {
  label: string;
  value: string | number;
  gradient: string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-xl ${gradient}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1.5 text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [credits, setCredits] = useState("3");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Load all courses from the server
  async function loadCourses() {
    try {
      const data = await api<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
  }, []);

  // Create a new course, refresh the list and show a short success message
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      await api("/api/courses", {
        method: "POST",
        body: JSON.stringify({ code, title, credits: Number(credits) }),
      });
      setNotice(`${code.toUpperCase()} was added successfully`);
      setTimeout(() => setNotice(""), 3000);
      setCode("");
      setTitle("");
      setCredits("3");
      setShowForm(false);
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create course");
    } finally {
      setSaving(false);
    }
  }

  // Numbers for the stat cards
  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
  const unassigned = courses.filter((c) => !c.teacherId).length;

  // Filter by code or title
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
    );
  }, [courses, search]);

  return (
    <RoleGuard role="admin">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Courses</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Create and manage the courses offered this semester.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setError("");
          }}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:brightness-110"
        >
          {showForm ? "Close" : "+ Add course"}
        </button>
      </div>

      {/* Success message */}
      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total courses"
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
        <StatCard
          label="Without a teacher"
          value={unassigned}
          gradient="from-amber-500 to-orange-500"
          icon="👤"
        />
      </div>

      {/* Add course form (hidden until the button is pressed) */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-indigo-500/30 bg-white p-5 shadow-sm dark:bg-neutral-900 md:p-6"
        >
          <h3 className="font-semibold">New course</h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <input
              required
              minLength={3}
              maxLength={20}
              placeholder="Code (e.g. CSE 4205)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
            />
            <input
              required
              minLength={3}
              maxLength={120}
              placeholder="Course title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} lg:col-span-2`}
            />
            <input
              required
              type="number"
              min={0.5}
              max={6}
              step={0.5}
              placeholder="Credits"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save course"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="mt-8">
        <input
          type="search"
          placeholder="Search by code or title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} sm:max-w-sm`}
        />
      </div>

      {/* Course cards */}
      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading courses...</p>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
            <p className="text-3xl">📚</p>
            <p className="mt-2 font-medium">No courses yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Press &quot;Add course&quot; to create the first one.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No course matches your search.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const gradient = gradientFor(c.code);
              // Letters of the code (e.g. "CSE") shown inside the icon
              const prefix =
                c.code.replace(/[^A-Za-z]/g, "").slice(0, 3) || "?";

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
                      {prefix}
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
                    <span
                      className={
                        c.teacherId ? "text-emerald-500" : "text-amber-500"
                      }
                    >
                      {c.teacherId ? "Teacher assigned" : "No teacher yet"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
