"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldAlert, Send } from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import ResultPanel from "@/components/ResultPanel";

type Q = {
  type: "mcq" | "short" | "broad";
  text: string;
  cloCode: string;
  options: string[] | null;
};
type Item = {
  slot: string;
  label: string;
  marks: number;
  main: Q;
  alt: Q | null;
};
type Answer = { selected: "main" | "alt"; text: string; choice: number | null };
type View = {
  exam: {
    _id: string;
    title: string;
    durationMinutes: number;
    totalMarks: number;
  };
  attempt: {
    status: "in_progress" | "submitted";
    startedAt: string;
    deadline: string;
    submittedAt: string | null;
    submitReason: string | null;
  };
  items: Item[];
  answers: Record<string, Answer>;
  serverNow: string;
};
type ExamRow = {
  _id: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  totalMarks: number;
  itemCount: number;
  state: "upcoming" | "open" | "closed";
  attempt: { status: "in_progress" | "submitted" } | null;
};
type Phase = "loading" | "intro" | "running" | "done" | "error";
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAnswered(item: Item, a: Answer | undefined) {
  if (!a) return false;
  const q = a.selected === "alt" && item.alt ? item.alt : item.main;
  return q.type === "mcq" ? a.choice !== null : a.text.trim() !== "";
}

function formatLeft(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

// The countdown. It has its own state, so the questions are not drawn again every second.
// The time left is worked out from the deadline and the offset between the server's clock and this computer's clock.
function Countdown({
  deadline,
  offset,
  onExpire,
}: {
  deadline: string;
  offset: number;
  onExpire: () => void;
}) {
  const end = new Date(deadline).getTime();
  const [left, setLeft] = useState(() =>
    Math.max(0, end - (Date.now() + offset)),
  );
  const expired = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, end - (Date.now() + offset));
      setLeft(remaining);
      if (remaining <= 0 && !expired.current) {
        expired.current = true;
        onExpire();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [end, offset, onExpire]);

  const tone =
    left <= 60_000
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : left <= 300_000
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div
      role="timer"
      aria-label="Time left"
      className={`rounded-lg px-3 py-1.5 font-mono text-base font-semibold tabular-nums ${tone} ${
        left <= 60_000 && left > 0 ? "animate-pulse" : ""
      }`}
    >
      {formatLeft(left)}
    </div>
  );
}

type BlockProps = {
  item: Item;
  answer: Answer | undefined;
  onChange: (slot: string, patch: Partial<Answer>) => void;
};

// One part of the exam: the question (or its alternative) and the place for the answer
function QuestionBlock({ item, answer, onChange }: BlockProps) {
  const which = answer?.selected ?? "main";
  const q = which === "alt" && item.alt ? item.alt : item.main;

  return (
    <section
      id={`q-${item.slot}`}
      className="scroll-mt-36 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {item.label}
        </span>
        <span className="text-xs text-neutral-500">
          {formatMarks(item.marks)} marks
        </span>
      </div>

      {/* A part with a choice: the student answers only one of the two */}
      {item.alt && (
        <div className="mt-3">
          <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
            {(["main", "alt"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onChange(item.slot, { selected: w })}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  which === w
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {w === "main" ? "This question" : "Or this one"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">
            Answer only one of the two. Switching clears your answer.
          </p>
        </div>
      )}

      <p className="mt-4 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
        {q.text}
      </p>

      {q.type === "mcq" && q.options ? (
        <div className="mt-3 space-y-2" role="radiogroup">
          {q.options.map((o, i) => {
            const checked = answer?.choice === i;
            return (
              <label
                key={i}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  checked
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                    : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                }`}
              >
                <input
                  type="radio"
                  name={`opt-${item.slot}-${which}`}
                  checked={checked}
                  onChange={() =>
                    onChange(item.slot, { selected: which, choice: i })
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                />
                <span className="mt-px font-semibold text-neutral-500">
                  {String.fromCharCode(65 + i)}.
                </span>
                <span className="min-w-0 flex-1 break-words">{o}</span>
              </label>
            );
          })}
          {answer?.choice !== null && answer?.choice !== undefined && (
            <button
              type="button"
              onClick={() =>
                onChange(item.slot, { selected: which, choice: null })
              }
              className="text-xs font-medium text-neutral-500 hover:underline"
            >
              Clear my choice
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            rows={q.type === "broad" ? 10 : 5}
            maxLength={10000}
            placeholder="Write your answer here"
            value={answer?.text ?? ""}
            onChange={(e) =>
              onChange(item.slot, { selected: which, text: e.target.value })
            }
            className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <p className="mt-1 text-right text-xs text-neutral-400">
            {(answer?.text ?? "").length} / 10000
          </p>
        </div>
      )}
    </section>
  );
}

function ExamPlayer() {
  const { examId } = useParams<{ examId: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [row, setRow] = useState<ExamRow | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [offset, setOffset] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [awayCount, setAwayCount] = useState(0);

  // Values that the autosave must read at any moment, kept outside the drawing of the page
  const itemsRef = useRef<Item[]>([]);
  const answersRef = useRef<Record<string, Answer>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const submittingRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const expireRef = useRef<() => void>(() => {});

  // Shows what the server says about the attempt: the questions, the saved answers and the deadline
  const applyView = useCallback((v: View) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = new Set();
    itemsRef.current = v.items;
    answersRef.current = v.answers;
    setView(v);
    setOffset(new Date(v.serverNow).getTime() - Date.now());
    setAnswers(v.answers);
    setPhase(v.attempt.status === "in_progress" ? "running" : "done");
  }, []);

  // When the page opens: find the exam, then continue the attempt if there is one
  useEffect(() => {
    let cancelled = false;

    api<{ exams: ExamRow[] }>("/api/exams")
      .then(async (d) => {
        if (cancelled) return;
        const found = d.exams.find((x) => x._id === examId);
        if (!found) {
          setError(
            "This exam was not found, or you are not enrolled in its course.",
          );
          setPhase("error");
          return;
        }
        setRow(found);
        if (found.attempt) {
          const v = await api<View>(`/api/exams/${examId}/attempt`);
          if (!cancelled) applyView(v);
        } else {
          setPhase("intro");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load the exam");
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [examId, applyView]);

  // Stop the autosave timer when the page is closed
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // While the exam runs: report tab and window switches, and warn before the page is closed
  useEffect(() => {
    if (phase !== "running") return;

    let away = false;
    const send = (type: "hidden" | "visible") => {
      void api(`/api/exams/${examId}/attempt/events`, {
        method: "POST",
        body: JSON.stringify({ type }),
      }).catch(() => {});
    };
    // One leave is reported once, even when the tab change also blurs the window
    const leave = () => {
      if (away) return;
      away = true;
      setAwayCount((n) => n + 1);
      send("hidden");
    };
    const back = () => {
      if (!away) return;
      away = false;
      send("visible");
    };
    const onVisibility = () => (document.hidden ? leave() : back());
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [phase, examId]);

  function schedule(ms: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), ms);
  }

  // The answers of the given parts, as the server expects them
  function payloadFor(slots: string[]) {
    const out: Record<
      string,
      { selected: "main" | "alt"; text?: string; choice?: number | null }
    > = {};
    for (const slot of slots) {
      const a = answersRef.current[slot];
      const item = itemsRef.current.find((i) => i.slot === slot);
      if (!a || !item) continue;
      const q = a.selected === "alt" && item.alt ? item.alt : item.main;
      out[slot] =
        q.type === "mcq"
          ? { selected: a.selected, choice: a.choice }
          : { selected: a.selected, text: a.text };
    }
    return out;
  }

  // Asks the server whether the exam is already over (time ran out, or it was handed in)
  async function checkClosed(): Promise<boolean> {
    try {
      const v = await api<View>(`/api/exams/${examId}/attempt`);
      if (v.attempt.status !== "in_progress") {
        applyView(v);
        return true;
      }
    } catch {
      // Probably no connection. The save is tried again later.
    }
    return false;
  }

  // Sends the answers that changed since the last save
  async function flush() {
    if (savingRef.current) return schedule(800);
    const slots = [...dirtyRef.current];
    if (slots.length === 0) return;

    dirtyRef.current = new Set();
    savingRef.current = true;
    setSaveState("saving");
    try {
      await api(`/api/exams/${examId}/attempt/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers: payloadFor(slots) }),
      });
      setSaveState(dirtyRef.current.size > 0 ? "pending" : "saved");
      setSavedAt(new Date());
    } catch {
      // Keep the answers and try again soon
      slots.forEach((s) => dirtyRef.current.add(s));
      setSaveState("error");
      const closed = await checkClosed();
      if (!closed) schedule(4000);
    } finally {
      savingRef.current = false;
    }
  }

  // The autosave timer always runs the newest version of flush
  useEffect(() => {
    flushRef.current = flush;
  });

  // Called for every change of an answer
  function change(slot: string, patch: Partial<Answer>) {
    const current = answersRef.current[slot] ?? {
      selected: "main" as const,
      text: "",
      choice: null,
    };
    const next: Answer = { ...current, ...patch };
    // Switching between the question and its alternative starts a fresh answer
    if (patch.selected && patch.selected !== current.selected) {
      next.text = "";
      next.choice = null;
    }
    answersRef.current = { ...answersRef.current, [slot]: next };
    setAnswers(answersRef.current);
    dirtyRef.current.add(slot);
    setSaveState("pending");
    schedule(1200);
  }

  async function start() {
    setStarting(true);
    try {
      applyView(
        await api<View>(`/api/exams/${examId}/start`, { method: "POST" }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the exam");
    } finally {
      setStarting(false);
    }
  }

  // Hands in the exam with every answer. "auto" is true when the time ran out.
  async function submit(auto: boolean) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    if (timerRef.current) clearTimeout(timerRef.current);

    try {
      const v = await api<View>(`/api/exams/${examId}/attempt/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: payloadFor(Object.keys(answersRef.current)),
        }),
      });
      applyView(v);
      toast.success(
        auto
          ? "Time is over. Your answers were handed in."
          : "Your exam was handed in.",
      );
    } catch (e) {
      // The server may have closed the exam a moment earlier. Check before showing an error.
      const closed = await checkClosed();
      if (!closed)
        toast.error(
          e instanceof Error
            ? e.message
            : "Could not hand in the exam. Try again.",
        );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  useEffect(() => {
    expireRef.current = () => void submit(true);
  });
  const onExpire = useCallback(() => expireRef.current(), []);

  const answeredCount = useMemo(
    () =>
      view
        ? view.items.filter((i) => isAnswered(i, answers[i.slot])).length
        : 0,
    [view, answers],
  );

  const backLink = (
    <Link
      href="/student/exams"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      <ArrowLeft size={14} />
      Back to exams
    </Link>
  );

  if (phase === "loading") {
    return (
      <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-2xl">
        {backLink}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          {error}
        </div>
      </div>
    );
  }

  // Before the exam: the rules and the Start button
  if (phase === "intro" && row) {
    const canStart = row.state === "open";
    const rules = [
      "The timer starts when you press Start and cannot be paused. The server keeps the time, so reloading the page gives no extra time.",
      "Your answers are saved automatically a moment after you type or choose.",
      "When the time is over, your answers are handed in automatically.",
      "Leaving this page (another tab or window) is recorded, and your teacher can see how many times.",
      "The AI tutor is not available during the exam.",
      "You can take this exam only once.",
    ];

    return (
      <div className="mx-auto max-w-2xl">
        {backLink}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
          <p className="text-xs text-neutral-500">
            {row.courseCode} · {row.courseTitle}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {row.title}
          </h1>

          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[
              ["Time", `${row.durationMinutes} min`],
              ["Marks", formatMarks(row.totalMarks)],
              ["Parts", String(row.itemCount)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg bg-neutral-50 px-3 py-3 dark:bg-neutral-950"
              >
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-xs text-neutral-500">
            Open from {formatDateTime(row.startsAt)} to{" "}
            {formatDateTime(row.endsAt)}
          </p>

          <ul className="mt-5 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            {rules.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                {r}
              </li>
            ))}
          </ul>

          {row.state === "upcoming" && (
            <p className="mt-5 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-600 dark:text-sky-400">
              This exam opens on {formatDateTime(row.startsAt)}.
            </p>
          )}
          {row.state === "closed" && (
            <p className="mt-5 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              This exam is closed.
            </p>
          )}

          <button
            onClick={start}
            disabled={!canStart || starting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {starting ? "Starting..." : "Start exam"}
          </button>
        </div>
      </div>
    );
  }

  // After the exam: handed in by the student, or by the time limit
  if (phase === "done" && view) {
    const byTime = view.attempt.submitReason === "time";
    return (
      <div className="mx-auto max-w-2xl">
        {backLink}
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 size={26} />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Exam handed in</h1>
          <p className="mt-1 text-sm text-neutral-500">{view.exam.title}</p>
          <p className="mx-auto mt-4 max-w-md text-sm text-neutral-600 dark:text-neutral-300">
            {byTime
              ? "The time was over, so the answers you had saved were handed in."
              : `You handed in the exam${view.attempt.submittedAt ? ` at ${formatDateTime(view.attempt.submittedAt)}` : ""}.`}{" "}
            Your marks will appear here after your teacher has checked and
            published them.
          </p>
          <ResultPanel examId={examId} />
          <Link
            href="/student/exams"
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Back to exams
          </Link>
        </div>
      </div>
    );
  }

  if (phase !== "running" || !view) return null;

  const saveText =
    saveState === "saving"
      ? "Saving..."
      : saveState === "pending"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Could not save, trying again..."
          : saveState === "saved" && savedAt
            ? `Saved at ${savedAt.toLocaleTimeString("en-GB")}`
            : "Answers are saved automatically";

  const unanswered = view.items.length - answeredCount;

  // The exam fills the whole screen, so the side menu is out of the way
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{view.exam.title}</p>
            <p
              className={`truncate text-xs ${saveState === "error" ? "text-red-500" : "text-neutral-500"}`}
            >
              {answeredCount} of {view.items.length} answered · {saveText}
            </p>
          </div>
          <Countdown
            deadline={view.attempt.deadline}
            offset={offset}
            onExpire={onExpire}
          />
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Send size={15} />
            )}
            <span className="hidden sm:inline">Submit</span>
          </button>
        </div>

        {/* Question buttons: filled when answered, a click jumps to the question */}
        <div className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-4 pb-3">
          {view.items.map((i) => {
            const done = isAnswered(i, answers[i.slot]);
            return (
              <button
                key={i.slot}
                onClick={() =>
                  document
                    .getElementById(`q-${i.slot}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  done
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {i.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {awayCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <p>
              You left the exam page {awayCount} time
              {awayCount === 1 ? "" : "s"}. Your teacher can see this. Please
              stay on this page until you hand in.
            </p>
          </div>
        )}

        {view.items.map((item) => (
          <QuestionBlock
            key={item.slot}
            item={item}
            answer={answers[item.slot]}
            onChange={change}
          />
        ))}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          <Send size={16} />
          Submit exam
        </button>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        title="Hand in your exam?"
        message={`You have answered ${answeredCount} of ${view.items.length} parts${
          unanswered > 0 ? ` (${unanswered} not answered)` : ""
        }. You cannot change your answers after handing in.`}
        confirmLabel="Hand in"
        onConfirm={() => void submit(false)}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default function ExamPage() {
  return (
    <RoleGuard role="student">
      <ExamPlayer />
    </RoleGuard>
  );
}
