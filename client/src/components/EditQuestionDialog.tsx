"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Question } from "@/components/QuestionCard";

type Clo = { _id: string; code: string; text: string };
type Topic = { _id: string; name: string };

// The list from the server also carries the CLO and topic ids of every question
type Editable = Question & { cloId?: string; topicId?: string };

const BLOOM = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
];

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

function Label({
  children,
  extra,
}: {
  children: React.ReactNode;
  extra?: string;
}) {
  return (
    <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
      {children}
      {extra && <span className="font-normal text-neutral-400">{extra}</span>}
    </span>
  );
}

// Shorten a long CLO so it fits inside a dropdown
function shorten(text: string, max = 50) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type Props = {
  question: Question | null;
  courseId: string;
  clos: Clo[];
  topics: Topic[];
  onClose: () => void;
  onSaved: () => void;
};
type FormProps = Omit<Props, "question"> & { question: Question };

function EditForm({
  question,
  courseId,
  clos,
  topics,
  onClose,
  onSaved,
}: FormProps) {
  const q = question as Editable;
  const isMcq = q.type === "mcq";

  const [text, setText] = useState(q.text);
  const [options, setOptions] = useState<string[]>(
    q.options ?? ["", "", "", ""],
  );
  const [correctIndex, setCorrectIndex] = useState(q.correctIndex ?? 0);
  const [answer, setAnswer] = useState(q.answer);
  const [difficulty, setDifficulty] = useState<string>(q.difficulty);
  const [bloom, setBloom] = useState<string>(q.bloom);
  const [cloId, setCloId] = useState(q.cloId ?? "");
  const [topicId, setTopicId] = useState(q.topicId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Close with the Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Only the fields that really changed are sent to the server
  const changes: Record<string, unknown> = {};
  if (text.trim() !== q.text) changes.text = text.trim();
  if (answer.trim() !== q.answer) changes.answer = answer.trim();
  if (difficulty !== q.difficulty) changes.difficulty = difficulty;
  if (bloom !== q.bloom) changes.bloom = bloom;
  if (cloId && cloId !== q.cloId) changes.cloId = cloId;
  if (topicId && topicId !== q.topicId) changes.topicId = topicId;
  if (isMcq) {
    const cleaned = options.map((o) => o.trim());
    if (JSON.stringify(cleaned) !== JSON.stringify(q.options))
      changes.options = cleaned;
    if (correctIndex !== q.correctIndex) changes.correctIndex = correctIndex;
  }
  const hasChanges = Object.keys(changes).length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Check in the browser first, the server checks again
    if (text.trim().length < 10)
      return setError("The question must have at least 10 characters");
    if (answer.trim().length < 3)
      return setError("The suggested answer is too short");
    if (isMcq) {
      const cleaned = options.map((o) => o.trim());
      if (cleaned.some((o) => !o)) return setError("Fill in all four options");
      if (new Set(cleaned.map((o) => o.toLowerCase())).size !== 4) {
        return setError("The four options must be different");
      }
    }

    setSaving(true);
    try {
      await api(`/api/courses/${courseId}/questions/${q._id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      toast.success("Question updated");
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the changes",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      {/* Dark backdrop: clicking it closes the dialog */}
      <div
        className="anim-fade-in fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => !saving && onClose()}
      />

      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        className="anim-pop-in relative my-4 w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Pencil size={16} />
          </div>
          <div>
            <h2 id="edit-title" className="text-base font-semibold">
              Edit question
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Changing the text does not change the status ({q.status}).
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <Label extra={`${text.length}/800`}>Question</Label>
            <textarea
              rows={3}
              maxLength={800}
              value={text}
              disabled={saving}
              onChange={(e) => setText(e.target.value)}
              className={`${fieldClass} resize-y`}
            />
          </label>

          {/* Four options and the correct one, for multiple choice only */}
          {isMcq && (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-neutral-500">
                Options (select the correct one)
              </legend>
              <div className="space-y-2">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                      checked={correctIndex === i}
                      disabled={saving}
                      onChange={() => setCorrectIndex(i)}
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <span className="w-4 shrink-0 text-sm font-semibold text-neutral-500">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <input
                      value={o}
                      maxLength={300}
                      disabled={saving}
                      onChange={(e) =>
                        setOptions((list) =>
                          list.map((x, n) => (n === i ? e.target.value : x)),
                        )
                      }
                      className={fieldClass}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block">
            <Label extra={`${answer.length}/3000`}>
              {isMcq ? "Explanation of the correct option" : "Suggested answer"}
            </Label>
            <textarea
              rows={isMcq ? 3 : 6}
              maxLength={3000}
              value={answer}
              disabled={saving}
              onChange={(e) => setAnswer(e.target.value)}
              className={`${fieldClass} resize-y`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Difficulty</Label>
              <select
                value={difficulty}
                disabled={saving}
                onChange={(e) => setDifficulty(e.target.value)}
                className={fieldClass}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="block">
              <Label>Bloom&apos;s level</Label>
              <select
                value={bloom}
                disabled={saving}
                onChange={(e) => setBloom(e.target.value)}
                className={`${fieldClass} capitalize`}
              >
                {BLOOM.map((b) => (
                  <option key={b} value={b}>
                    {b.charAt(0).toUpperCase() + b.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <Label>Learning outcome (CLO)</Label>
              <select
                value={cloId}
                disabled={saving}
                onChange={(e) => setCloId(e.target.value)}
                className={fieldClass}
              >
                {clos.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.code} · {shorten(c.text)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <Label>Topic</Label>
              <select
                value={topicId}
                disabled={saving}
                onChange={(e) => setTopicId(e.target.value)}
                className={fieldClass}
              >
                {topics.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!hasChanges || saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {saving ? "Saving..." : hasChanges ? "Save changes" : "No changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

// The form is created fresh for every question, so old text never carries over to the next one
export default function EditQuestionDialog(props: Props) {
  if (!props.question) return null;
  return (
    <EditForm key={props.question._id} {...props} question={props.question} />
  );
}
