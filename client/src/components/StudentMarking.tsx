"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Criterion = {
  text: string;
  max: number;
  awarded: number;
  justification: string;
};
type Grade = {
  max: number;
  awarded: number | null;
  source: "auto" | "ai" | "teacher" | null;
  approved: boolean;
  feedback?: string;
  criteria?: Criterion[];
};
type Item = {
  slot: string;
  label: string;
  marks: number;
  chosen: "main" | "alt";
  question: {
    type: "mcq" | "short" | "broad";
    text: string;
    options: string[] | null;
    correctIndex: number | null;
    suggestedAnswer: string;
  };
  answer: {
    text: string;
    optionIndex: number | null;
    optionText: string | null;
  };
  grade: Grade | null;
};
type Detail = {
  student: { id: string; name: string; email: string };
  attempt: { status: string; tabSwitches: number; submitReason: string | null };
  items: Item[];
  summary: { total: number; pending: number; unapproved: number };
};

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

function sourceChip(g: Grade | null) {
  if (!g || g.awarded === null)
    return {
      text: "Waiting for marks",
      className: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800",
    };
  if (g.source === "ai" && !g.approved) {
    return {
      text: "AI marks, needs your approval",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  if (g.source === "ai")
    return {
      text: "AI marks, approved",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  if (g.source === "teacher")
    return {
      text: "Marked by you",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  return {
    text: "Marked by the computer",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };
}

type RowProps = {
  item: Item;
  saving: boolean;
  onSave: (slot: string, awarded: number, feedback: string) => Promise<void>;
};

// One part of the exam: the question, what the student wrote and the marks
function MarkRow({ item, saving, onSave }: RowProps) {
  const g = item.grade;
  const [awarded, setAwarded] = useState(
    g && g.awarded !== null ? String(g.awarded) : "",
  );
  const [feedback, setFeedback] = useState(g?.feedback ?? "");
  const [showAnswer, setShowAnswer] = useState(false);

  const n = Number(awarded);
  const valid =
    awarded !== "" &&
    Number.isFinite(n) &&
    n >= 0 &&
    n <= item.marks &&
    Number.isInteger(n * 2);
  const chip = sourceChip(g);
  const q = item.question;

  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {item.label}
        </span>
        <span className="text-xs text-neutral-500">
          {formatMarks(item.marks)} marks
        </span>
        {item.chosen === "alt" && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
            answered the choice (Or)
          </span>
        )}
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.className}`}
        >
          {chip.text}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
        {q.text}
      </p>

      {q.type === "mcq" && q.options ? (
        <ol className="mt-2 space-y-1.5">
          {q.options.map((o, i) => {
            const picked = item.answer.optionIndex === i;
            const correct = q.correctIndex === i;
            return (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  correct
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : picked
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <span className="font-semibold text-neutral-500">
                  {String.fromCharCode(65 + i)}.
                </span>
                <span className="min-w-0 flex-1 break-words">{o}</span>
                {picked && (
                  <span className="shrink-0 text-xs text-neutral-500">
                    student&apos;s choice
                  </span>
                )}
                {correct && (
                  <Check
                    size={15}
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                )}
              </li>
            );
          })}
          {item.answer.optionIndex === null && (
            <li className="text-xs text-neutral-500">
              The student did not choose an option.
            </li>
          )}
        </ol>
      ) : (
        <div className="mt-2">
          <p className="text-xs font-medium text-neutral-500">
            The student&apos;s answer
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-sm leading-relaxed dark:bg-neutral-950">
            {item.answer.text.trim() ? (
              item.answer.text
            ) : (
              <span className="text-neutral-400">No answer written.</span>
            )}
          </p>
          <button
            onClick={() => setShowAnswer((v) => !v)}
            className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {showAnswer ? "Hide suggested answer" : "Show suggested answer"}
          </button>
          {showAnswer && (
            <p className="anim-fade-in mt-1 whitespace-pre-wrap break-words rounded-lg border border-neutral-200 p-3 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
              {q.suggestedAnswer}
            </p>
          )}
        </div>
      )}

      {/* What the AI decided for each criterion */}
      {g?.criteria && g.criteria.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {g.criteria.map((c, i) => (
            <li
              key={i}
              className="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-950"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{c.text}</span>
                <span className="shrink-0 font-semibold">
                  {formatMarks(c.awarded)} / {formatMarks(c.max)}
                </span>
              </div>
              <p className="mt-0.5 text-neutral-500">{c.justification}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">
            Marks (0 to {formatMarks(item.marks)})
          </span>
          <input
            type="number"
            min={0}
            max={item.marks}
            step={0.5}
            value={awarded}
            disabled={saving}
            onChange={(e) => setAwarded(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">
            Comment for the student
          </span>
          <input
            value={feedback}
            maxLength={1000}
            disabled={saving}
            onChange={(e) => setFeedback(e.target.value)}
            className={fieldClass}
          />
        </label>
        <button
          onClick={() => void onSave(item.slot, n, feedback)}
          disabled={!valid || saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {g?.source === "ai" && !g.approved
            ? "Approve with these marks"
            : "Save marks"}
        </button>
      </div>
    </section>
  );
}

type Props = {
  courseId: string;
  examId: string;
  studentId: string;
  onClose: () => void;
  // Called after marks were saved, so the list behind the dialog can load again
  onChanged: () => void;
};

// A dialog to check and change the marks of one student
export default function StudentMarking({
  courseId,
  examId,
  studentId,
  onClose,
  onChanged,
}: Props) {
  const base = `/api/courses/${courseId}/assessments/${examId}/attempts/${studentId}`;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Detail>(base)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Could not load this exam",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [base, refresh]);

  // Close with the Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveMarks(slot: string, awarded: number, feedback: string) {
    setSaving(true);
    try {
      await api(`${base}/marks`, {
        method: "PATCH",
        body: JSON.stringify({ items: { [slot]: { awarded, feedback } } }),
      });
      toast.success("Marks saved");
      setRefresh((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the marks");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-3 sm:items-center sm:p-4">
      <div
        className="anim-fade-in absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="anim-pop-in relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {detail?.student.name ?? "Loading..."}
            </h2>
            {detail && (
              <p className="mt-0.5 text-xs text-neutral-500">
                {detail.student.email} · total so far{" "}
                {formatMarks(detail.summary.total)}
                {detail.summary.pending > 0 &&
                  ` · ${detail.summary.pending} waiting for marks`}
                {detail.summary.unapproved > 0 &&
                  ` · ${detail.summary.unapproved} AI marks to approve`}
                {detail.attempt.tabSwitches > 0 &&
                  ` · ${detail.attempt.tabSwitches} tab switches`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {detail === null
            ? [0, 1].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
                />
              ))
            : detail.items.map((item) => (
                <MarkRow
                  key={`${item.slot}:${item.grade?.source}:${item.grade?.awarded}:${item.grade?.approved}`}
                  item={item}
                  saving={saving}
                  onSave={saveMarks}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
