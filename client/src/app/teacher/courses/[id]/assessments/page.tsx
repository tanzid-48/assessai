"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardCheck,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api } from "@/lib/api";

type State = "upcoming" | "open" | "closed";
type Exam = {
  _id: string;
  title: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  totalMarks: number;
  itemCount: number;
  state: State;
  enrolled: number;
  started: number;
  submitted: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
};
type PaperOption = {
  _id: string;
  title: string;
  totalMarks: number;
  slotCount: number;
  filledCount: number;
  durationMinutes?: number;
};
type RowStatus = "not_started" | "in_progress" | "submitted";
type Row = {
  studentId: string;
  name: string;
  email: string;
  status: RowStatus;
  startedAt: string | null;
  submittedAt: string | null;
  submitReason: string | null;
  tabSwitches: number;
  answered: number;
  total: number;
};

const STATE_STYLE: Record<State, { label: string; className: string }> = {
  upcoming: {
    label: "Upcoming",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  open: {
    label: "Open now",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  closed: {
    label: "Closed",
    className:
      "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

const ROW_STYLE: Record<RowStatus, { label: string; className: string }> = {
  not_started: {
    label: "Not started",
    className:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
  in_progress: {
    label: "In progress",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  submitted: {
    label: "Submitted",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium text-neutral-500">
      {children}
    </span>
  );
}

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// An <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the local time of the computer
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type FormProps = {
  courseId: string;
  courseKey: string;
  papers: PaperOption[];
  // The start and end that are filled in when the form opens
  defaults: { start: string; end: string };
  onCreated: () => void;
};

function NewExamForm({
  courseId,
  courseKey,
  papers,
  defaults,
  onCreated,
}: FormProps) {
  // Only a finished paper (every place has a question) can become an exam
  const finished = papers.filter(
    (p) => p.slotCount > 0 && p.filledCount === p.slotCount,
  );
  const first = finished[0];

  const [paperId, setPaperId] = useState(first?._id ?? "");
  const [title, setTitle] = useState(first?.title ?? "");
  const [minutes, setMinutes] = useState(String(first?.durationMinutes ?? 60));
  const [startsAt, setStartsAt] = useState(defaults.start);
  const [endsAt, setEndsAt] = useState(defaults.end);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(true);
  const [busy, setBusy] = useState(false);

  if (finished.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        You need a finished question paper first (every place filled with an
        approved question). Make one on the{" "}
        <Link
          href={`/teacher/courses/${courseKey}/papers`}
          className="font-medium underline"
        >
          question papers page
        </Link>
        .
      </div>
    );
  }

  function choosePaper(id: string) {
    setPaperId(id);
    const p = finished.find((x) => x._id === id);
    if (p) {
      setTitle(p.title);
      if (p.durationMinutes) setMinutes(String(p.durationMinutes));
    }
  }

  // A quick way to make an exam that students can take right now
  function startNow() {
    const now = Date.now();
    setStartsAt(toLocalInput(new Date(now)));
    setEndsAt(toLocalInput(new Date(now + 2 * 60 * 60 * 1000)));
  }

  // Checks made in the browser first. The server checks everything again.
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const windowMin =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.floor((endMs - startMs) / 60000)
      : NaN;
  const duration = Number(minutes);
  const problem = !paperId
    ? "Choose a finished paper"
    : title.trim().length < 3
      ? "Write a title of at least 3 characters"
      : !Number.isInteger(duration) || duration < 1 || duration > 600
        ? "The exam time must be between 1 and 600 minutes"
        : !(windowMin > 0)
          ? "The end must be after the start"
          : windowMin < duration
            ? `The open window (${windowMin} min) is shorter than the exam time (${duration} min)`
            : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problem) return toast.error(problem);

    setBusy(true);
    try {
      await api(`/api/courses/${courseId}/assessments`, {
        method: "POST",
        body: JSON.stringify({
          paperId,
          title: title.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          durationMinutes: duration,
          shuffleQuestions: shuffleQ,
          shuffleOptions: shuffleO,
        }),
      });
      toast.success("Exam created. Enrolled students can see it now.");
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the exam",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="anim-fade-in rounded-xl border border-indigo-500/30 bg-white p-4 shadow-sm dark:bg-neutral-900 sm:p-5"
    >
      <h2 className="text-sm font-semibold">New exam</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        The questions are copied from the paper now. Changing the paper or the
        question bank later does not change this exam.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <Label>Question paper</Label>
          <select
            value={paperId}
            disabled={busy}
            onChange={(e) => choosePaper(e.target.value)}
            className={fieldClass}
          >
            {finished.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title} · {formatMarks(p.totalMarks)} marks
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <Label>Exam title</Label>
          <input
            value={title}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <Label>Opens at</Label>
          <input
            type="datetime-local"
            value={startsAt}
            disabled={busy}
            onChange={(e) => setStartsAt(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <Label>Closes at</Label>
          <input
            type="datetime-local"
            value={endsAt}
            disabled={busy}
            onChange={(e) => setEndsAt(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <Label>Time for each student (minutes)</Label>
          <input
            type="number"
            min={1}
            max={600}
            value={minutes}
            disabled={busy}
            onChange={(e) => setMinutes(e.target.value)}
            className={fieldClass}
          />
        </label>

        <div className="flex flex-col justify-end gap-2 text-sm sm:col-span-2 lg:col-span-3">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={shuffleQ}
              disabled={busy}
              onChange={(e) => setShuffleQ(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
            Shuffle the order of the questions
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={shuffleO}
              disabled={busy}
              onChange={(e) => setShuffleO(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
            Shuffle the options of multiple choice questions
          </label>
        </div>
      </div>

      <div
        className={`mt-4 rounded-lg px-3 py-2 text-sm ${
          problem
            ? "border border-red-500/30 bg-red-500/10 text-red-500"
            : "bg-neutral-50 text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300"
        }`}
      >
        {problem ||
          `Open for ${windowMin} minutes. Each student gets ${duration} minutes after pressing Start.`}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={busy || problem !== ""}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {busy ? "Creating..." : "Create exam"}
        </button>
        <button
          type="button"
          onClick={startNow}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Open now for 2 hours
        </button>
      </div>
    </form>
  );
}

type CardProps = {
  exam: Exam;
  courseId: string;
  leaving: boolean;
  onDelete: () => void;
};

function ExamCard({ exam, courseId, leaving, onDelete }: CardProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const state = STATE_STYLE[exam.state];
  const percent = exam.enrolled
    ? Math.round((exam.submitted / exam.enrolled) * 100)
    : 0;

  async function loadRows() {
    setLoading(true);
    try {
      const d = await api<{ students: Row[] }>(
        `/api/courses/${courseId}/assessments/${exam._id}/attempts`,
      );
      setRows(d.students);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadRows();
  }

  return (
    <li
      className={`anim-row-in rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity dark:border-neutral-800 dark:bg-neutral-900 ${
        leaving ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{exam.title}</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${state.className}`}
            >
              {state.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {formatTime(exam.startsAt)} to {formatTime(exam.endsAt)} ·{" "}
            {exam.durationMinutes} min each · {formatMarks(exam.totalMarks)}{" "}
            marks · {exam.itemCount} parts
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs text-neutral-500">
              {exam.started} of {exam.enrolled} started · {exam.submitted}{" "}
              submitted
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={toggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Report
            <ChevronDown
              size={14}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          <button
            onClick={onDelete}
            disabled={exam.started > 0}
            aria-label={`Delete ${exam.title}`}
            title={
              exam.started > 0
                ? "Students have started this exam, so it cannot be deleted"
                : "Delete"
            }
            className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {open && (
        <div className="anim-fade-in border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <p className="text-xs text-neutral-500">
              Tab switches are shown for your information only. Nothing is taken
              away automatically.
            </p>
            <button
              onClick={loadRows}
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-60 dark:text-indigo-400"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {rows === null ? (
            <p className="px-5 pb-5 text-sm text-neutral-500">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-neutral-500">
              No students are enrolled in this course yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((r) => {
                const s = ROW_STYLE[r.status];
                return (
                  <li
                    key={r.studentId}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="min-w-0 sm:w-56">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {r.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-medium ${s.className}`}
                      >
                        {s.label}
                        {r.status === "submitted" && r.submitReason === "time"
                          ? " (time ran out)"
                          : ""}
                      </span>
                      {r.status !== "not_started" && (
                        <>
                          <span className="text-neutral-500">
                            answered {r.answered} of {r.total}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${
                              r.tabSwitches > 0
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                            }`}
                          >
                            {r.tabSwitches} tab switch
                            {r.tabSwitches === 1 ? "" : "es"}
                          </span>
                          {r.startedAt && (
                            <span className="text-neutral-500">
                              started {formatTime(r.startedAt)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Exams() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<{ code: string; title: string } | null>(
    null,
  );
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<PaperOption[]>([]);
  const [loading, setLoading] = useState(true);
  // Changing this number makes the lists load again
  const [refresh, setRefresh] = useState(0);
  // The form is open while this is set. It holds the start and end that the form starts with.
  const [defaults, setDefaults] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [toDelete, setToDelete] = useState<Exam | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  // The exams and the papers, loaded when the page opens and every time "refresh" changes
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api<{ assessments: Exam[] }>(`/api/courses/${id}/assessments`),
      api<{ papers: PaperOption[] }>(`/api/courses/${id}/papers`),
    ])
      .then(([e, p]) => {
        if (cancelled) return;
        setExams(e.assessments);
        setPapers(p.papers);
      })
      .catch((e) => {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Could not load the exams",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, refresh]);

  // The course name for the page header
  useEffect(() => {
    api<{ course: { code: string; title: string } }>(
      `/api/courses/${id}/outline`,
    )
      .then((d) => setCourse(d.course))
      .catch(() => {});
  }, [id]);

  function toggleForm() {
    if (defaults) {
      setDefaults(null);
      return;
    }
    // The first suggestion: opens now and stays open for two hours
    const now = Date.now();
    setDefaults({
      start: toLocalInput(new Date(now)),
      end: toLocalInput(new Date(now + 2 * 60 * 60 * 1000)),
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const exam = toDelete;
    setToDelete(null);
    setLeavingId(exam._id);
    try {
      await api(`/api/courses/${id}/assessments/${exam._id}`, {
        method: "DELETE",
      });
      setExams((list) => list.filter((x) => x._id !== exam._id));
      setRefresh((n) => n + 1);
      toast.success("Exam deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the exam");
    } finally {
      setLeavingId(null);
    }
  }

  return (
    <>
      <Link
        href={`/teacher/courses/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft size={14} />
        Back to course
      </Link>

      <PageHeader
        title="Exams"
        description={course ? `${course.code} · ${course.title}` : undefined}
        action={
          <button
            onClick={toggleForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {defaults ? <X size={16} /> : <Plus size={16} />}
            {defaults ? "Close" : "New exam"}
          </button>
        }
      />

      {defaults && (
        <div className="mt-6">
          <NewExamForm
            courseId={id}
            courseKey={id}
            papers={papers}
            defaults={defaults}
            onCreated={() => {
              setDefaults(null);
              setLoading(true);
              setRefresh((n) => n + 1);
            }}
          />
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-14 text-center dark:border-neutral-700">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
              <ClipboardCheck size={18} />
            </div>
            <p className="mt-3 text-sm font-medium">No exams yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Press &quot;New exam&quot; to turn a finished question paper into
              a timed exam.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {exams.map((x) => (
              <ExamCard
                key={x._id}
                exam={x}
                courseId={id}
                leaving={leavingId === x._id}
                onDelete={() => setToDelete(x)}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this exam?"
        message={
          toDelete
            ? `"${toDelete.title}" will be removed. The question paper stays.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

export default function ExamsPage() {
  return (
    <RoleGuard role="teacher">
      <Exams />
    </RoleGuard>
  );
}
