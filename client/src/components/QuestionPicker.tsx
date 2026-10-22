"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Question } from "@/components/QuestionCard";

const TYPE_LABEL = { mcq: "MCQ", short: "Short", broad: "Broad" } as const;

const DIFFICULTY_STYLE = {
  easy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  hard: "bg-red-500/10 text-red-600 dark:text-red-400",
} as const;

const selectClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

type Props = {
  open: boolean;
  courseId: string;
  // Shown at the top, for example "Question 2 (b), 3 marks"
  title: string;
  // Questions that are already in this paper. They are shown greyed out and cannot be chosen again.
  usedIds: string[];
  onPick: (question: Question) => void;
  onClose: () => void;
};

// A dialog that lists the approved questions of the course so one can be put into a paper
export default function QuestionPicker({
  open,
  courseId,
  title,
  usedIds,
  onPick,
  onClose,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");

  // Load the approved questions every time the dialog opens, so new approvals show up
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSearch("");
    setType("");

    api<{ questions: Question[] }>(
      `/api/courses/${courseId}/questions?status=approved&limit=100`,
    )
      .then((d) => {
        if (!cancelled) setQuestions(d.questions);
      })
      .catch((e) => {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Could not load the questions",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  // Close with the Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const used = useMemo(() => new Set(usedIds), [usedIds]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter(
      (x) =>
        (!type || x.type === type) && (!q || x.text.toLowerCase().includes(q)),
    );
  }, [questions, search, type]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 sm:items-center">
      <div
        className="anim-fade-in absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        className="anim-pop-in relative flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <h2 id="picker-title" className="text-base font-semibold">
              Choose a question
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">{title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800 sm:flex-row sm:px-5">
          <div className="relative sm:flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              autoFocus
              placeholder="Search the approved questions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${selectClass} w-full pl-9`}
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
          >
            <option value="">All types</option>
            <option value="mcq">MCQ</option>
            <option value="short">Short</option>
            <option value="broad">Broad</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">
                {questions.length === 0
                  ? "No approved questions yet"
                  : "No question matches"}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {questions.length === 0
                  ? "Approve questions in the question bank first. Only approved questions can go into a paper."
                  : "Try another search or type."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((q) => {
                const inUse = used.has(q._id);
                return (
                  <li key={q._id}>
                    <button
                      onClick={() => onPick(q)}
                      disabled={inUse}
                      className={`block w-full rounded-xl border p-3.5 text-left transition-colors ${
                        inUse
                          ? "cursor-not-allowed border-neutral-200 opacity-50 dark:border-neutral-800"
                          : "border-neutral-200 hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:border-neutral-800 dark:hover:bg-indigo-500/5"
                      }`}
                    >
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
                        {q.topicName && (
                          <span className="truncate text-neutral-500">
                            {q.topicName}
                          </span>
                        )}
                        {inUse && (
                          <span className="ml-auto inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <Check size={13} />
                            Already in this paper
                          </span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {q.text}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
