"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api } from "@/lib/api";

type Paper = {
  _id: string;
  title: string;
  batch: string;
  semester: string;
  totalMarks: number;
  questionCount: number;
  slotCount: number;
  filledCount: number;
  updatedAt: string;
};

// Ready-made layouts. "parts" lists the marks of every part of one question: [2, 3] means (a) 2 marks and (b) 3 marks.
type Preset = {
  key: string;
  label: string;
  hint: string;
  questions: number;
  parts: number[];
  minutes: number;
};
const PRESETS: Preset[] = [
  {
    key: "mid",
    label: "Mid-term",
    hint: "5 questions, each with (a) 2 marks and (b) 3 marks",
    questions: 5,
    parts: [2, 3],
    minutes: 90,
  },
  {
    key: "quiz",
    label: "Quiz",
    hint: "5 questions of 2 marks each",
    questions: 5,
    parts: [2],
    minutes: 20,
  },
  {
    key: "custom",
    label: "Custom",
    hint: "Choose the number of questions and the marks of each part",
    questions: 0,
    parts: [],
    minutes: 60,
  },
];

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Turns "2, 3" into [2, 3]. Marks must be between 0.5 and 100, in steps of 0.5.
function parseParts(text: string): { parts: number[] } | { error: string } {
  const pieces = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (pieces.length === 0)
    return { error: "Write the marks of each part, for example 2, 3" };
  if (pieces.length > 6)
    return { error: "A question can have at most 6 parts" };

  const parts = pieces.map(Number);
  if (
    parts.some(
      (n) => !Number.isFinite(n) || n < 0.5 || n > 100 || (n * 2) % 1 !== 0,
    )
  ) {
    return { error: "Marks must be between 0.5 and 100, in steps of 0.5" };
  }
  return { parts };
}

type FormProps = { courseId: string; onCreated: () => void };

function NewPaperForm({ courseId, onCreated }: FormProps) {
  const [title, setTitle] = useState("Mid-Term Examination, Summer - 2026");
  const [program, setProgram] = useState("B.Sc. in CSE (HSC)");
  const [batch, setBatch] = useState("");
  const [semester, setSemester] = useState("");
  const [minutes, setMinutes] = useState("90");
  const [presetKey, setPresetKey] = useState("mid");
  const [qCount, setQCount] = useState("5");
  const [partsText, setPartsText] = useState("2, 3");
  const [busy, setBusy] = useState(false);

  const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
  const custom = preset.key === "custom";

  // The layout that will be created, and a live summary of it
  const parsed = custom ? parseParts(partsText) : { parts: preset.parts };
  const questionCount = custom ? Number(qCount) : preset.questions;
  const countOk =
    Number.isInteger(questionCount) &&
    questionCount >= 1 &&
    questionCount <= 30;
  const perQuestion =
    "parts" in parsed ? parsed.parts.reduce((sum, n) => sum + n, 0) : 0;
  const total = countOk ? perQuestion * questionCount : 0;
  const layoutError =
    "error" in parsed
      ? parsed.error
      : !countOk
        ? "Choose between 1 and 30 questions"
        : "";

  function choose(p: Preset) {
    setPresetKey(p.key);
    // A ready-made layout also suggests a duration, which can still be changed
    if (p.key !== "custom") setMinutes(String(p.minutes));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3)
      return toast.error("Write a title of at least 3 characters");
    if ("error" in parsed) return toast.error(parsed.error);
    if (!countOk) return toast.error("Choose between 1 and 30 questions");
    const duration = Number(minutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 600) {
      return toast.error("The time must be between 5 and 600 minutes");
    }

    setBusy(true);
    try {
      await api(`/api/courses/${courseId}/papers`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          program: program.trim(),
          batch: batch.trim(),
          semester: semester.trim(),
          durationMinutes: duration,
          layout: Array.from({ length: questionCount }, () => parsed.parts),
        }),
      });
      toast.success("Paper created. Next, choose the questions for it.");
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the paper",
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
      <h2 className="text-sm font-semibold">New question paper</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2 lg:col-span-4">
          <Label>Title</Label>
          <input
            value={title}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <Label>Program</Label>
          <input
            value={program}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setProgram(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <Label>Batch</Label>
          <input
            value={batch}
            maxLength={30}
            placeholder="e.g. 23rd"
            disabled={busy}
            onChange={(e) => setBatch(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <Label>Semester</Label>
          <input
            value={semester}
            maxLength={30}
            placeholder="e.g. 7th"
            disabled={busy}
            onChange={(e) => setSemester(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <Label>Time (minutes)</Label>
          <input
            type="number"
            min={5}
            max={600}
            value={minutes}
            disabled={busy}
            onChange={(e) => setMinutes(e.target.value)}
            className={fieldClass}
          />
        </label>

        {/* Layout */}
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Layout</Label>
          <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                onClick={() => choose(p)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                  presetKey === p.key
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">{preset.hint}</p>
        </div>

        {custom && (
          <>
            <label className="block">
              <Label>Number of questions</Label>
              <input
                type="number"
                min={1}
                max={30}
                value={qCount}
                disabled={busy}
                onChange={(e) => setQCount(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block sm:col-span-1 lg:col-span-3">
              <Label>Marks of each part, separated by commas</Label>
              <input
                value={partsText}
                placeholder="e.g. 2, 3"
                disabled={busy}
                onChange={(e) => setPartsText(e.target.value)}
                className={fieldClass}
              />
            </label>
          </>
        )}
      </div>

      {/* Live summary */}
      <div
        className={`mt-4 rounded-lg px-3 py-2 text-sm ${
          layoutError
            ? "border border-red-500/30 bg-red-500/10 text-red-500"
            : "bg-neutral-50 text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300"
        }`}
      >
        {layoutError ||
          `${questionCount} question${questionCount === 1 ? "" : "s"} · ${
            "parts" in parsed ? questionCount * parsed.parts.length : 0
          } parts · ${formatMarks(total)} marks in total`}
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={busy || layoutError !== ""}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {busy ? "Creating..." : "Create paper"}
        </button>
      </div>
    </form>
  );
}

function Papers() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<{ code: string; title: string } | null>(
    null,
  );
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // The paper waiting for confirmation, and the row being deleted right now
  const [toDelete, setToDelete] = useState<Paper | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ papers: Paper[] }>(`/api/courses/${id}/papers`);
      setPapers(data.papers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the papers");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // The course name for the page header
  useEffect(() => {
    api<{ course: { code: string; title: string } }>(
      `/api/courses/${id}/outline`,
    )
      .then((d) => setCourse(d.course))
      .catch(() => {});
  }, [id]);

  async function confirmDelete() {
    if (!toDelete) return;
    const paper = toDelete;
    setToDelete(null);
    setLeavingId(paper._id);
    try {
      await api(`/api/courses/${id}/papers/${paper._id}`, { method: "DELETE" });
      toast.success("Paper deleted");
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not delete the paper",
      );
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
        title="Question papers"
        description={course ? `${course.code} · ${course.title}` : undefined}
        action={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "Close" : "New paper"}
          </button>
        }
      />

      {showForm && (
        <div className="mt-6">
          <NewPaperForm
            courseId={id}
            onCreated={() => {
              setShowForm(false);
              setLoading(true);
              load();
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
                className="h-24 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : papers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-14 text-center dark:border-neutral-700">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
              <FileText size={18} />
            </div>
            <p className="mt-3 text-sm font-medium">No question papers yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Press &quot;New paper&quot;, choose a layout, then fill it with
              your approved questions.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {papers.map((p) => {
              const percent = p.slotCount
                ? Math.round((p.filledCount / p.slotCount) * 100)
                : 0;
              const meta = [
                p.batch && `${p.batch} batch`,
                p.semester && `${p.semester} semester`,
                `${p.questionCount} question${p.questionCount === 1 ? "" : "s"}`,
                formatDate(p.updatedAt),
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <li
                  key={p._id}
                  className={`anim-row-in flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm transition-opacity dark:border-neutral-800 dark:bg-neutral-900 ${
                    leavingId === p._id ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <button
                    onClick={() =>
                      toast.info("Opening a paper comes in the next step")
                    }
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {p.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {meta}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                          <div
                            className={`h-full rounded-full ${percent === 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500">
                          {p.filledCount} of {p.slotCount} questions chosen
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-neutral-100 px-2 py-1 text-xs font-semibold dark:bg-neutral-800">
                      {formatMarks(p.totalMarks)} marks
                    </span>
                    <ChevronRight
                      size={16}
                      className="hidden shrink-0 text-neutral-400 sm:block"
                    />
                  </button>
                  <button
                    onClick={() => setToDelete(p)}
                    aria-label={`Delete ${p.title}`}
                    title="Delete"
                    className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this paper?"
        message={
          toDelete
            ? `"${toDelete.title}" will be removed. The questions stay in the question bank.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

export default function PapersPage() {
  return (
    <RoleGuard role="teacher">
      <Papers />
    </RoleGuard>
  );
}
