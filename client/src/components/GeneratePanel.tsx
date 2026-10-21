"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Topic = { _id: string; name: string };
type Clo = { _id: string; code: string; text: string };

type Props = {
  courseId: string;
  topics: Topic[];
  clos: Clo[];
  // Called after the new questions were saved, so the list can reload
  onGenerated: () => void;
};

const TYPES = [
  { key: "mcq", label: "MCQ" },
  { key: "short", label: "Short" },
  { key: "broad", label: "Broad" },
] as const;

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium text-neutral-500">
      {children}
    </span>
  );
}

// Shorten a long CLO so it fits inside a dropdown
function shorten(text: string, max = 55) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function GeneratePanel({
  courseId,
  topics,
  clos,
  onGenerated,
}: Props) {
  const [topicId, setTopicId] = useState("");
  const [cloId, setCloId] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("mcq");
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState("");
  const [busy, setBusy] = useState(false);

  // Until the teacher chooses, the first topic and the first CLO are used
  const topic = topicId || topics[0]?._id || "";
  const clo = cloId || clos[0]?._id || "";

  // Questions need a topic and a CLO, so ask for them first
  if (topics.length === 0 || clos.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        Add at least one CLO and one topic on the{" "}
        <Link
          href={`/teacher/courses/${courseId}`}
          className="font-medium underline"
        >
          course page
        </Link>{" "}
        before generating questions.
      </div>
    );
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      const r = await api<{ questions: unknown[] }>(
        `/api/courses/${courseId}/questions/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            topicId: topic,
            cloId: clo,
            type,
            count,
            ...(difficulty ? { difficulty } : {}),
          }),
        },
      );
      const n = r.questions.length;
      toast.success(
        `${n} question${n === 1 ? "" : "s"} generated. Review them before approving.`,
      );
      onGenerated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate questions",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={generate}
      className="anim-fade-in rounded-xl border border-indigo-500/30 bg-white p-4 shadow-sm dark:bg-neutral-900 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Sparkles size={18} />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Generate questions with AI</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            The AI writes questions only from your uploaded materials and lists
            the source pages. Every question waits as Pending until you approve
            it.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <Label>Topic</Label>
          <select
            value={topic}
            onChange={(e) => setTopicId(e.target.value)}
            disabled={busy}
            className={fieldClass}
          >
            {topics.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block lg:col-span-2">
          <Label>Learning outcome (CLO)</Label>
          <select
            value={clo}
            onChange={(e) => setCloId(e.target.value)}
            disabled={busy}
            className={fieldClass}
          >
            {clos.map((c) => (
              <option key={c._id} value={c._id}>
                {c.code} · {shorten(c.text)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <Label>Question type</Label>
          <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={busy}
                onClick={() => setType(t.key)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                  type === t.key
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <Label>How many</Label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={busy}
            className={fieldClass}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <Label>Difficulty</Label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            disabled={busy}
            className={fieldClass}
          >
            <option value="">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Sparkles size={16} />
            )}
            {busy ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>

      {busy && (
        <p className="mt-3 text-xs text-neutral-500">
          Reading the materials and writing the questions. This usually takes 10
          to 30 seconds.
        </p>
      )}
    </form>
  );
}
