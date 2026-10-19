"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api } from "@/lib/api";

type Course = { _id: string; code: string; title: string; credits: number };
type Student = { id: string; name: string; email: string };
type Enrolment = { id: string; studentId: string; name: string; email: string };

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

// Up to two letters shown in a round avatar
function initialsOf(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {initialsOf(name)}
    </div>
  );
}

function EnrolmentsAdmin() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courseId, setCourseId] = useState("");
  // The enrolled list remembers which course it belongs to, so a stale list is never shown
  const [loaded, setLoaded] = useState<{
    courseId: string;
    items: Enrolment[];
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  // The student waiting for confirmation, and the row being removed right now
  const [toRemove, setToRemove] = useState<Enrolment | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  // Load all courses and all students once
  useEffect(() => {
    Promise.all([
      api<{ courses: Course[] }>("/api/courses"),
      api<{ users: Student[] }>("/api/users?role=student"),
    ])
      .then(([c, s]) => {
        setCourses(c.courses);
        setStudents(s.users);
        if (c.courses.length) setCourseId(c.courses[0]._id);
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Failed to load data"),
      )
      .finally(() => setLoading(false));
  }, []);

  // Load the enrolled students whenever the course changes or a change was saved
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;

    api<{ enrollments: Enrolment[] }>(`/api/enrollments?courseId=${courseId}`)
      .then((d) => {
        if (!cancelled) setLoaded({ courseId, items: d.enrollments });
      })
      .catch((e) => {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Failed to load students",
          );
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, refresh]);

  const course = courses.find((c) => c._id === courseId);
  const listReady = loaded?.courseId === courseId;
  const enrolled = listReady ? loaded.items : [];

  // Students who are not in this course yet, filtered by the search box
  const available = useMemo(() => {
    const inCourse = new Set(enrolled.map((e) => e.studentId));
    const q = search.trim().toLowerCase();
    return students.filter(
      (s) =>
        !inCourse.has(s.id) &&
        (!q ||
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)),
    );
  }, [students, enrolled, search]);

  function selectCourse(id: string) {
    setCourseId(id);
    setPicked([]);
    setSearch("");
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  // Enrol every ticked student in the selected course
  async function addSelected() {
    if (!picked.length) return;
    setBusy(true);

    try {
      const r = await api<{ added: number; alreadyEnrolled: number }>(
        "/api/enrollments",
        {
          method: "POST",
          body: JSON.stringify({ courseId, studentIds: picked }),
        },
      );
      toast.success(
        `${r.added} student${r.added === 1 ? "" : "s"} enrolled in ${course?.code ?? "the course"}`,
      );
      setPicked([]);
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not enrol the students",
      );
    } finally {
      setBusy(false);
    }
  }

  // Close the dialog at once, fade the row while the server works, then it disappears
  async function confirmRemove() {
    if (!toRemove) return;
    const row = toRemove;
    setToRemove(null);
    setLeavingId(row.id);

    try {
      await api(`/api/enrollments/${row.id}`, { method: "DELETE" });
      toast.success(`${row.name} was removed`);
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not remove the student",
      );
    } finally {
      setLeavingId(null);
    }
  }

  // Message shown when the "add students" list is empty
  const emptyAddText =
    students.length === 0
      ? "No students have registered yet."
      : search
        ? "No student matches your search."
        : "All students are already enrolled in this course.";

  return (
    <>
      <PageHeader
        title="Enrolments"
        description="Choose a course, then add or remove its students."
      />

      {loadError && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="h-40 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-64 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800 lg:col-span-2" />
        </div>
      ) : courses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
          <p className="text-sm font-medium">No courses yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            Create a course first, then enrol students here.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Course picker: dropdown on small screens, list on large screens */}
          <div>
            <select
              value={courseId}
              onChange={(e) => selectCourse(e.target.value)}
              className={`${inputClass} lg:hidden`}
            >
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </select>

            <ul className="hidden divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 lg:block">
              {courses.map((c) => (
                <li key={c._id}>
                  <button
                    onClick={() => selectCourse(c._id)}
                    className={`block w-full px-4 py-3 text-left transition-colors ${
                      c._id === courseId
                        ? "bg-indigo-50 dark:bg-indigo-500/10"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    <p
                      className={`truncate text-sm font-medium ${
                        c._id === courseId
                          ? "text-indigo-700 dark:text-indigo-300"
                          : ""
                      }`}
                    >
                      {c.title}
                    </p>
                    <p className="text-xs text-neutral-500">{c.code}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {/* Students already in this course */}
            <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 dark:border-neutral-800 sm:px-5">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">
                    {course?.title}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {course?.code} · Enrolled students
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium dark:bg-neutral-800">
                  <Users size={13} />
                  {listReady ? enrolled.length : "–"}
                </span>
              </div>

              {!listReady ? (
                <p className="px-5 py-8 text-center text-sm text-neutral-500">
                  Loading...
                </p>
              ) : enrolled.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-neutral-500">
                  No students are enrolled in this course yet.
                </p>
              ) : (
                <ul className="max-h-96 divide-y divide-neutral-200 overflow-y-auto dark:divide-neutral-800">
                  {enrolled.map((row) => (
                    <li
                      key={row.id}
                      className={`anim-row-in flex items-center gap-3 px-4 py-3 transition-opacity duration-200 sm:px-5 ${
                        leavingId === row.id
                          ? "pointer-events-none opacity-40"
                          : ""
                      }`}
                    >
                      <Avatar name={row.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {row.name}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {row.email}
                        </p>
                      </div>
                      <button
                        onClick={() => setToRemove(row)}
                        aria-label={`Remove ${row.name}`}
                        title="Remove from course"
                        className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                      >
                        <UserMinus size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Add students to this course */}
            <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-neutral-200 px-4 py-3.5 dark:border-neutral-800 sm:px-5">
                <h2 className="text-sm font-semibold">Add students</h2>
                <p className="text-xs text-neutral-500">
                  Tick the students to enrol, then press the button.
                </p>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    type="search"
                    placeholder="Search by name or email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>

                {available.length > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">
                      {available.length} available
                    </span>
                    <div className="flex gap-3 font-medium text-indigo-600 dark:text-indigo-400">
                      <button
                        onClick={() => setPicked(available.map((s) => s.id))}
                        className="hover:underline"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setPicked([])}
                        className="hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {available.length === 0 ? (
                  <p className="py-6 text-center text-sm text-neutral-500">
                    {emptyAddText}
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-neutral-200 overflow-y-auto rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                    {available.map((s) => (
                      <li key={s.id} className="anim-row-in">
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                          <input
                            type="checkbox"
                            checked={picked.includes(s.id)}
                            onChange={() => togglePick(s.id)}
                            className="h-4 w-4 accent-indigo-600"
                          />
                          <Avatar name={s.name} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {s.name}
                            </p>
                            <p className="truncate text-xs text-neutral-500">
                              {s.email}
                            </p>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={addSelected}
                  disabled={busy || picked.length === 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {busy ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  {busy
                    ? "Enrolling..."
                    : picked.length
                      ? `Enrol ${picked.length} selected`
                      : "Enrol selected"}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toRemove !== null}
        title="Remove student?"
        message={
          toRemove
            ? `${toRemove.name} will be removed from ${course?.code ?? "this course"}. You can enrol them again later.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </>
  );
}

export default function AdminEnrolmentsPage() {
  return (
    <RoleGuard role="admin">
      <EnrolmentsAdmin />
    </RoleGuard>
  );
}
