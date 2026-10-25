"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, MessageSquare } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import { api } from "@/lib/api";

type Criterion = {
  text: string;
  max: number;
  awarded: number;
  justification: string;
};
type Item = {
  slot: string;
  label: string;
  marks: number;
  awarded: number;
  feedback: string;
  criteria: Criterion[];
  question: {
    type: "mcq" | "short" | "broad";
    text: string;
    options: string[] | null;
    correctIndex: number | null;
    suggestedAnswer: string;
    sources: { fileName: string; page: number }[];
  };
  yourAnswer: { text: string; optionIndex: number | null };
};
type Result = {
  exam: { _id: string; title: string };
  total: number;
  totalMarks: number;
  items: Item[];
};

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

function Page() {
  const { examId } = useParams<{ examId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<Result>(`/api/exams/${examId}/result`)
      .then((d) => {
        if (!cancelled) setResult(d);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load your result",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const back = (
    <Link
      href="/student/exams"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      <ArrowLeft size={14} />
      Back to exams
    </Link>
  );

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <div className="rounded-xl border border-neutral-200 bg-white px-6 py-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium">{error}</p>
          <p className="mt-1 text-sm text-neutral-500">
            Your marks appear here after your teacher has checked and published
            them.
          </p>
        </div>
      </div>
    );
  }

  if (!result)
    return (
      <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
    );

  const percent =
    result.totalMarks > 0
      ? Math.round((result.total / result.totalMarks) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-3xl">
      {back}

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <p className="text-xs text-neutral-500">Your result</p>
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight">
          {result.exam.title}
        </h1>
        <p className="mt-3 text-4xl font-bold tracking-tight">
          {formatMarks(result.total)}
          <span className="text-xl font-medium text-neutral-500">
            {" "}
            / {formatMarks(result.totalMarks)}
          </span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">{percent}%</p>
      </div>

      <div className="mt-4 space-y-3">
        {result.items.map((it) => {
          const q = it.question;
          const pages = [
            ...new Set(q.sources.map((s) => `${s.fileName}|${s.page}`)),
          ].map((k) => {
            const [file, page] = k.split("|");
            return { file, page };
          });

          return (
            <section
              key={it.slot}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {it.label}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    it.awarded >= it.marks
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : it.awarded > 0
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatMarks(it.awarded)} / {formatMarks(it.marks)}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
                {q.text}
              </p>

              {q.type === "mcq" && q.options ? (
                <ol className="mt-2 space-y-1.5">
                  {q.options.map((o, i) => {
                    const picked = it.yourAnswer.optionIndex === i;
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
                            your choice
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
                  {it.yourAnswer.optionIndex === null && (
                    <li className="text-xs text-neutral-500">
                      You did not choose an option.
                    </li>
                  )}
                </ol>
              ) : (
                <div className="mt-2">
                  <p className="text-xs font-medium text-neutral-500">
                    Your answer
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-sm leading-relaxed dark:bg-neutral-950">
                    {it.yourAnswer.text.trim() ? (
                      it.yourAnswer.text
                    ) : (
                      <span className="text-neutral-400">
                        No answer written.
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Why each mark was given */}
              {it.criteria.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs">
                  {it.criteria.map((c, i) => (
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
                      <p className="mt-0.5 text-neutral-500">
                        {c.justification}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {it.feedback && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-sm">
                  <MessageSquare
                    size={15}
                    className="mt-0.5 shrink-0 text-indigo-500"
                  />
                  <p>{it.feedback}</p>
                </div>
              )}

              {q.type !== "mcq" && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    See the suggested answer
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-neutral-200 p-3 text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
                    {q.suggestedAnswer}
                  </p>
                </details>
              )}

              {pages.length > 0 && (
                <p className="mt-3 text-xs text-neutral-500">
                  Read more:{" "}
                  {pages.map((p) => `${p.file}, page ${p.page}`).join("; ")}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <RoleGuard role="student">
      <Page />
    </RoleGuard>
  );
}
