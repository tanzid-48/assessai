"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flag,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  TYPE_LABEL,
  type Item,
  type Session,
  type Summary,
} from "@/lib/practice";
import ConfirmDialog from "@/components/ConfirmDialog";

type Props = {
  session: Session;
  onChange: (s: Session) => void;
  onExit: () => void;
  onPractiseTopic: (topicName: string) => void;
};

const LETTERS = ["A", "B", "C", "D"];

// One practice session: the questions one by one, then the summary
export default function PracticePlayer({
  session,
  onChange,
  onExit,
  onPractiseTopic,
}: Props) {
  const firstOpen = session.items.findIndex((i) => !i.answered);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const total = session.items.length;
  const item = session.items[index];
  const open = session.items.filter((i) => !i.answered).length;

  if (session.status === "finished") {
    return (
      <Finished
        session={session}
        onExit={onExit}
        onPractiseTopic={onPractiseTopic}
      />
    );
  }

  function go(to: number) {
    setIndex(to);
    setChoice(null);
    setText("");
  }

  async function submit() {
    if (busy || item.answered) return;
    setBusy(true);
    try {
      const body =
        item.type === "mcq"
          ? { slot: item.slot, choice }
          : { slot: item.slot, text };
      const res = await api<{ item: Item; summary: Summary }>(
        `/api/practice/sessions/${session.sessionId}/answer`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onChange({
        ...session,
        summary: res.summary,
        items: session.items.map((i) =>
          i.slot === res.item.slot ? res.item : i,
        ),
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save your answer",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setConfirm(false);
    setBusy(true);
    try {
      onChange(
        await api<Session>(
          `/api/practice/sessions/${session.sessionId}/finish`,
          {
            method: "POST",
          },
        ),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not finish the session",
      );
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    item.type === "mcq" ? choice !== null : text.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
          <span>
            Question {index + 1} of {total}
          </span>
          <span>{total - open} answered</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {session.items.map((q, i) => (
            <button
              key={q.slot}
              onClick={() => go(i)}
              aria-label={`Go to question ${i + 1}`}
              aria-current={i === index}
              className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                i === index
                  ? "bg-indigo-600 text-white"
                  : q.answered
                    ? q.correct === false
                      ? "bg-red-500/15 text-red-500"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {TYPE_LABEL[item.type]}
          </span>
          {item.topicName && (
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {item.topicName}
            </span>
          )}
        </div>

        <p className="whitespace-pre-wrap break-words text-base font-medium leading-relaxed">
          {item.text}
        </p>

        {item.type === "mcq" && item.options && (
          <div className="mt-4 space-y-2">
            {item.options.map((option, k) => {
              const right = item.answered && k === item.correctChoice;
              const wrong = item.answered && k === item.yourChoice && !right;
              const picked = !item.answered && choice === k;
              return (
                <button
                  key={k}
                  disabled={item.answered}
                  onClick={() => setChoice(k)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors ${
                    right
                      ? "border-emerald-500 bg-emerald-500/10"
                      : wrong
                        ? "border-red-500 bg-red-500/10"
                        : picked
                          ? "border-indigo-500 bg-indigo-500/10"
                          : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                  } disabled:cursor-default`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs font-semibold dark:bg-neutral-800">
                    {LETTERS[k]}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{option}</span>
                  {right && (
                    <CheckCircle2
                      size={18}
                      className="shrink-0 text-emerald-500"
                    />
                  )}
                  {wrong && (
                    <XCircle size={18} className="shrink-0 text-red-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {item.type !== "mcq" && !item.answered && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={item.type === "short" ? 4 : 8}
            maxLength={5000}
            placeholder="Write your answer..."
            aria-label="Your answer"
            className="mt-4 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950"
          />
        )}

        {!item.answered && (
          <button
            disabled={!canSubmit || busy}
            onClick={() => void submit()}
            className="mt-4 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Checking..."
              : item.type === "mcq"
                ? "Check answer"
                : "Submit answer"}
          </button>
        )}

        {item.answered && <Result item={item} />}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          disabled={index === 0}
          onClick={() => go(index - 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <ArrowLeft size={15} /> Previous
        </button>

        <div className="flex gap-2">
          {index < total - 1 && (
            <button
              onClick={() => go(index + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Next <ArrowRight size={15} />
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => (open === 0 ? void finish() : setConfirm(true))}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              open === 0
                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                : "border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            <Flag size={15} /> Finish
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Finish this session?"
        message={`${open} ${open === 1 ? "question is" : "questions are"} not answered yet. Unanswered questions do not count, and you cannot answer them after finishing.`}
        confirmLabel="Finish"
        tone="primary"
        onConfirm={() => void finish()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

// What a student sees after answering: the verdict (multiple choice), the solution and the pages of the materials
function Result({ item }: { item: Item }) {
  return (
    <div className="mt-5 space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      {item.type === "mcq" ? (
        <p
          className={`flex items-center gap-2 text-sm font-semibold ${
            item.correct
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-500"
          }`}
        >
          {item.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {item.correct ? "Correct" : "Not quite"}
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            Written answers are not marked. Compare your answer with the
            suggested answer.
          </p>
          <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Your answer
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {item.yourText}
            </p>
          </div>
        </>
      )}

      <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-500/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          {item.type === "mcq" ? "Explanation" : "Suggested answer"}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {item.solution}
        </p>
      </div>

      {item.sources && item.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.sources.map((s) => (
            <span
              key={`${s.fileName}:${s.page}`}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <BookOpen size={12} />
              {s.fileName} · page {s.page}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The summary of a finished session
function Finished({
  session,
  onExit,
  onPractiseTopic,
}: Pick<Props, "session" | "onExit" | "onPractiseTopic">) {
  const s = session.summary;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">Session finished</p>
        {s.percent !== null ? (
          <>
            <p
              className={`mt-2 text-5xl font-semibold tabular-nums ${
                s.percent < 70 ? "text-amber-500" : "text-emerald-500"
              }`}
            >
              {s.percent}%
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {s.correct} of {s.mcqAnswered} multiple choice questions correct
            </p>
          </>
        ) : (
          <p className="mt-2 text-lg font-medium">
            {s.answered} written {s.answered === 1 ? "answer" : "answers"} done
          </p>
        )}
      </div>

      {s.wrongTopics.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-semibold">Practise these topics again</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.wrongTopics.map((t) => (
              <button
                key={t}
                onClick={() => onPractiseTopic(t)}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              >
                <RotateCcw size={12} />
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={onExit}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          New session
        </button>
        <Link
          href="/student/progress"
          className="rounded-lg border border-neutral-300 px-5 py-2.5 text-center text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          See my progress
        </Link>
      </div>
    </div>
  );
}
