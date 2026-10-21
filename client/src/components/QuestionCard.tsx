"use client";

import { useState } from "react";
import { Check, FileText, Pencil, RotateCcw, Trash2, X } from "lucide-react";

export type Question = {
  _id: string;
  type: "mcq" | "short" | "broad";
  text: string;
  options: string[] | null;
  correctIndex: number | null;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  bloom: string;
  cloCode: string;
  topicName: string | null;
  status: "pending" | "approved" | "rejected";
  sources: { fileName: string; page: number }[];
};

const TYPE_LABEL = { mcq: "MCQ", short: "Short", broad: "Broad" } as const;

const DIFFICULTY_STYLE = {
  easy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  hard: "bg-red-500/10 text-red-600 dark:text-red-400",
} as const;

type Props = {
  question: Question;
  busy: boolean;
  onStatus: (status: Question["status"]) => void;
  onEdit: () => void;
  onDelete: () => void;
};

// One question with its answer, labels and source pages
export default function QuestionCard({
  question: q,
  busy,
  onStatus,
  onEdit,
  onDelete,
}: Props) {
  const [showAnswer, setShowAnswer] = useState(false);

  // The same page of the same file is shown once
  const pages = [
    ...new Set(q.sources.map((s) => `${s.fileName}|${s.page}`)),
  ].map((key) => {
    const [fileName, page] = key.split("|");
    return { fileName, page };
  });

  return (
    <div
      className={`anim-row-in rounded-xl border bg-white p-4 shadow-sm transition-opacity dark:bg-neutral-900 sm:p-5 ${
        busy ? "pointer-events-none opacity-50" : ""
      } ${
        q.status === "approved"
          ? "border-emerald-500/30"
          : q.status === "rejected"
            ? "border-neutral-200 opacity-80 dark:border-neutral-800"
            : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      {/* Labels */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {TYPE_LABEL[q.type]}
        </span>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-medium dark:bg-neutral-800">
          {q.cloCode}
        </span>
        <span
          className={`rounded-md px-2 py-0.5 font-medium capitalize ${DIFFICULTY_STYLE[q.difficulty]}`}
        >
          {q.difficulty}
        </span>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 capitalize dark:bg-neutral-800">
          {q.bloom}
        </span>
        {q.topicName && (
          <span className="truncate text-neutral-500">{q.topicName}</span>
        )}
      </div>

      {/* Question */}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
        {q.text}
      </p>

      {/* Options of a multiple choice question */}
      {q.type === "mcq" && q.options && (
        <ol className="mt-3 space-y-1.5">
          {q.options.map((o, i) => {
            const correct = i === q.correctIndex;
            return (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  correct
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <span className="mt-px font-semibold text-neutral-500">
                  {String.fromCharCode(65 + i)}.
                </span>
                <span className="min-w-0 flex-1 break-words">{o}</span>
                {correct && (
                  <Check
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Suggested answer */}
      <button
        onClick={() => setShowAnswer((v) => !v)}
        className="mt-3 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {showAnswer ? "Hide suggested answer" : "Show suggested answer"}
      </button>
      {showAnswer && (
        <div className="anim-fade-in mt-2 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
          {q.answer}
        </div>
      )}

      {/* Source pages */}
      {pages.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <FileText size={13} />
          {pages.map((p) => (
            <span
              key={`${p.fileName}|${p.page}`}
              className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800"
            >
              {p.fileName.length > 28
                ? `${p.fileName.slice(0, 26)}…`
                : p.fileName}
              , page {p.page}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        {q.status !== "approved" && (
          <button
            onClick={() => onStatus("approved")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <Check size={14} />
            Approve
          </button>
        )}
        {q.status === "pending" && (
          <button
            onClick={() => onStatus("rejected")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <X size={14} />
            Reject
          </button>
        )}
        {q.status !== "pending" && (
          <button
            onClick={() => onStatus("pending")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <RotateCcw size={14} />
            Back to pending
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onEdit}
            aria-label="Edit question"
            title="Edit"
            className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete question"
            title="Delete"
            className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
