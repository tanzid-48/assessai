"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, GraduationCap, Plus, Search, UserX, X } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import CourseCard from "@/components/CourseCard";
import { api } from "@/lib/api";

type Course = {
  _id: string;
  code: string;
  title: string;
  credits: number;
  teacherId?: string | null;
  teacherName?: string | null;
};

type Teacher = { id: string; name: string; email: string };

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

function CoursesAdmin() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [pageError, setPageError] = useState("");
  // The course whose teacher is being saved right now
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [credits, setCredits] = useState("3");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Show a green message for three seconds
  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 3000);
  }

  async function loadCourses() {
    try {
      const data = await api<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }

  // The teacher list fills the dropdown on every course card
  async function loadTeachers() {
    try {
      const data = await api<{ users: Teacher[] }>("/api/users?role=teacher");
      setTeachers(data.users);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to load teachers");
    }
  }

  useEffect(() => {
    loadCourses();
    loadTeachers();
  }, []);

  // Create a new course, refresh the list and show a short success message
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      await api("/api/courses", {
        method: "POST",
        body: JSON.stringify({ code, title, credits: Number(credits) }),
      });
      showNotice(`${code.toUpperCase()} was added`);
      setCode("");
      setTitle("");
      setCredits("3");
      setShowForm(false);
      await loadCourses();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not create course",
      );
    } finally {
      setSaving(false);
    }
  }

  // Assign a teacher to a course. An empty value removes the teacher.
  async function assignTeacher(courseId: string, teacherId: string) {
    setPageError("");
    setAssigningId(courseId);

    try {
      await api(`/api/courses/${courseId}/teacher`, {
        method: "PATCH",
        body: JSON.stringify({ teacherId: teacherId || null }),
      });
      await loadCourses();
      showNotice(teacherId ? "Teacher assigned" : "Teacher removed");
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : "Could not update the teacher",
      );
    } finally {
      setAssigningId(null);
    }
  }

  const totalCredits = courses.reduce(
    (sum, c) => sum + (Number(c.credits) || 0),
    0,
  );
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
    <>
      <PageHeader
        title="Courses"
        description="Create courses and assign a teacher to each one."
        action={
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setFormError("");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "Close" : "Add course"}
          </button>
        }
      />

      {notice && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </div>
      )}
      {pageError && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
          {pageError}
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total courses"
          value={courses.length}
          icon={BookOpen}
        />
        <StatCard
          label="Total credits"
          value={totalCredits}
          icon={GraduationCap}
        />
        <StatCard label="Without a teacher" value={unassigned} icon={UserX} />
      </div>

      {/* Add course form (hidden until the button is pressed) */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
        >
          <h2 className="text-sm font-semibold">New course</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

          {formError && (
            <p className="mt-3 text-sm text-red-500">{formError}</p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save course"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="relative mt-6 sm:max-w-xs">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="search"
          placeholder="Search by code or title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-9`}
        />
      </div>

      {/* Course cards */}
      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
            <p className="text-sm font-medium">No courses yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Press &quot;Add course&quot; to create the first one.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No course matches your search.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => (
              <CourseCard
                key={c._id}
                code={c.code}
                title={c.title}
                credits={c.credits}
              >
                {/* Teacher dropdown: saves as soon as a teacher is picked */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-neutral-500">
                    Teacher
                  </span>
                  <select
                    value={c.teacherId ?? ""}
                    disabled={assigningId === c._id}
                    onChange={(e) => assignTeacher(c._id, e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
                  >
                    <option value="">Not assigned</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </CourseCard>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function AdminCoursesPage() {
  return (
    <RoleGuard role="admin">
      <CoursesAdmin />
    </RoleGuard>
  );
}
