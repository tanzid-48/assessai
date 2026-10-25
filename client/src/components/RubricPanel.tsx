"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Rubric = {
  criteria: { text: string; max: number }[];
  approved: boolean;
  source: "ai" | "teacher";
  updatedAt: string;
};
type Part = {
  key: string;
  label: string;
  marks: number;
  question: string;
  suggestedAnswer: string;
  rubric: Rubric | null;
};
type Row = { text: string; max: string };

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

type EditorProps = { base: string; part: Part; onChanged: () => void };

// The marking scheme of one written question: the criteria with their marks, and the buttons
function PartEditor({ base, part, onChanged }: EditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    (part.rubric?.criteria ?? []).map((c) => ({
      text: c.text,
      max: String(c.max),
    })),
  );
  const [busy, setBusy] = useState<"draft" | "save" | "approve" | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const sum = rows.reduce((s, r) => s + (Number(r.max) || 0), 0);
  const rowsOk =
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.text.trim().length >= 3 &&
        Number(r.max) >= 0.5 &&
        Number.isInteger(Number(r.max) * 2),
    );
  const sumOk = Math.abs(sum - part.marks) < 1e-9;
  const valid = rowsOk && sumOk;
  const approved = part.rubric?.approved === true;

  function update(i: number, patch: Partial<Row>) {
    setRows((list) => list.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }

  async function draft() {
    setBusy("draft");
    try {
      await api(`${base}/rubrics/draft`, {
        method: "POST",
        body: JSON.stringify({ key: part.key }),
      });
      toast.success("The AI wrote a draft. Check it, then approve it.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not write the draft");
    } finally {
      setBusy(null);
    }
  }

  async function save(approve: boolean) {
    setBusy(approve ? "approve" : "save");
    try {
      await api(`${base}/rubrics`, {
        method: "PUT",
        body: JSON.stringify({
          key: part.key,
          approved: approve,
          criteria: rows.map((r) => ({
            text: r.text.trim(),
            max: Number(r.max),
          })),
        }),
      });
      toast.success(approve ? "Marking scheme approved" : "Draft saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {part.label}
        </span>
        <span className="text-xs text-neutral-500">
          {formatMarks(part.marks)} marks
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            approved
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : part.rubric
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
          }`}
        >
          {approved
            ? "Approved"
            : part.rubric
              ? "Draft, not approved"
              : "No scheme yet"}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {part.question}
      </p>
      <button
        onClick={() => setShowAnswer((v) => !v)}
        className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {showAnswer ? "Hide suggested answer" : "Show suggested answer"}
      </button>
      {showAnswer && (
        <p className="anim-fade-in mt-2 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
          {part.suggestedAnswer}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                value={r.text}
                maxLength={300}
                disabled={busy !== null}
                onChange={(e) => update(i, { text: e.target.value })}
                aria-label={`Criterion ${i + 1}`}
                className={fieldClass}
              />
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={r.max}
                disabled={busy !== null}
                onChange={(e) => update(i, { max: e.target.value })}
                aria-label={`Marks of criterion ${i + 1}`}
                className={`${fieldClass} w-20 shrink-0`}
              />
              <button
                onClick={() =>
                  setRows((list) => list.filter((_, n) => n !== i))
                }
                disabled={busy !== null || rows.length === 1}
                aria-label="Remove this criterion"
                className="mt-1 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() =>
                setRows((list) => [...list, { text: "", max: "0.5" }])
              }
              disabled={busy !== null || rows.length >= 8}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
            >
              <Plus size={13} />
              Add a criterion
            </button>
            <span
              className={`text-xs font-medium ${sumOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
            >
              {formatMarks(sum)} of {formatMarks(part.marks)} marks
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={draft}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {busy === "draft" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
          ) : (
            <Sparkles size={14} />
          )}
          {part.rubric ? "Write a new draft with AI" : "Write a draft with AI"}
        </button>
        {rows.length > 0 && (
          <>
            <button
              onClick={() => save(false)}
              disabled={!valid || busy !== null}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {busy === "save" ? "Saving..." : "Save as draft"}
            </button>
            <button
              onClick={() => save(true)}
              disabled={!valid || busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              <Check size={14} />
              {busy === "approve" ? "Approving..." : "Approve"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

type Props = { courseId: string; examId: string };

// The marking schemes of all written questions of an exam
export default function RubricPanel({ courseId, examId }: Props) {
  const base = `/api/courses/${courseId}/assessments/${examId}`;
  const [parts, setParts] = useState<Part[] | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ parts: Part[] }>(`${base}/rubrics`)
      .then((d) => {
        if (!cancelled) setParts(d.parts);
      })
      .catch((e) => {
        if (!cancelled)
          toast.error(
            e instanceof Error
              ? e.message
              : "Could not load the marking schemes",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [base, refresh]);

  if (parts === null)
    return (
      <div className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
    );

  if (parts.length === 0) {
    return (
      <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:bg-neutral-950">
        This exam has only multiple choice questions, so no marking scheme is
        needed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {parts.map((p) => (
        <PartEditor
          key={`${p.key}:${p.rubric?.updatedAt ?? "none"}`}
          base={base}
          part={p}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      ))}
    </div>
  );
}
