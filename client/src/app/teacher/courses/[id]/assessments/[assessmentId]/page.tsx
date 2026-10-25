"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCheck, Eye, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import RubricPanel from "@/components/RubricPanel";
import StudentMarking from "@/components/StudentMarking";
import { api } from "@/lib/api";

type Row = {
  studentId: string;
  name: string;
  email: string;
  status: "not_started" | "in_progress" | "submitted";
  tabSwitches: number;
  total: number | null;
  pending: number;
  unapproved: number;
};
type Results = {
  published: boolean;
  totalMarks: number;
  itemCount: number;
  students: Row[];
};

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

const STATUS: Record<Row["status"], { label: string; className: string }> = {
  not_started: {
    label: "Not started",
    className:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
  in_progress: {
    label: "In progress",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  submitted: {
    label: "Handed in",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

// A numbered step of the marking work
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Marking() {
  const { id, assessmentId } = useParams<{
    id: string;
    assessmentId: string;
  }>();
  const base = `/api/courses/${id}/assessments/${assessmentId}`;

  const [title, setTitle] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<"mark" | "approve" | "publish" | null>(null);
  const [progress, setProgress] = useState("");
  const [review, setReview] = useState<Row | null>(null);

  // The students and their marks
  useEffect(() => {
    let cancelled = false;
    api<Results>(`${base}/results`)
      .then((d) => {
        if (!cancelled) setResults(d);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load the results",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [base, refresh]);

  // The title of the exam
  useEffect(() => {
    api<{ assessment: { title: string } }>(base)
      .then((d) => setTitle(d.assessment.title))
      .catch(() => {});
  }, [base]);

  // Marks everything that a computer can mark, then lets the AI mark the written answers a few at a time
  async function markWithAi() {
    setBusy("mark");
    try {
      setProgress("Marking multiple choice and blank answers...");
      const auto = await api<{ attempts: number }>(`${base}/grade-auto`, {
        method: "POST",
        body: "{}",
      });
      if (auto.attempts === 0) {
        toast.info("Nobody has handed in this exam yet.");
        return;
      }

      let done = 0;
      let left = 0;
      let needs: string[] = [];
      for (let round = 0; round < 40; round++) {
        setProgress(
          done > 0
            ? `The AI has marked ${done} written answers so far...`
            : "The AI is marking the written answers...",
        );
        const r = await api<{
          graded: number;
          failed: number;
          remaining: number;
          needsRubric: string[];
        }>(`${base}/grade-ai`, {
          method: "POST",
          body: JSON.stringify({ limit: 4 }),
        });
        done += r.graded;
        left = r.remaining;
        needs = r.needsRubric;
        if (r.remaining === 0 || r.graded === 0) break;
      }

      if (needs.length > 0)
        toast.warning(
          `Approve the marking scheme first for: ${needs.join(", ")}`,
        );
      if (left > 0) {
        toast.error(
          `The AI could not mark ${left} answers. Try again in a minute, the free limit may be reached.`,
        );
      } else if (done > 0) {
        toast.success(
          `The AI marked ${done} written answers. Check them and approve.`,
        );
      } else if (needs.length === 0) {
        toast.info("Everything that can be marked has been marked.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Marking failed");
    } finally {
      setProgress("");
      setBusy(null);
      setRefresh((n) => n + 1);
    }
  }

  async function approveAll() {
    setBusy("approve");
    try {
      const r = await api<{ approved: number }>(`${base}/approve`, {
        method: "POST",
        body: "{}",
      });
      toast.success(
        r.approved > 0
          ? `${r.approved} AI marks approved`
          : "No AI marks were waiting",
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve");
    } finally {
      setBusy(null);
    }
  }

  async function setPublished(published: boolean) {
    setBusy("publish");
    try {
      await api(`${base}/publish`, {
        method: "POST",
        body: JSON.stringify({ published }),
      });
      toast.success(
        published
          ? "Results published. Students can see their marks now."
          : "Results hidden from the students",
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not change the results",
      );
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <Link
      href={`/teacher/courses/${id}/assessments`}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      <ArrowLeft size={14} />
      Back to exams
    </Link>
  );

  if (error) {
    return (
      <>
        {back}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          {error}
        </div>
      </>
    );
  }

  const students = results?.students ?? [];
  const handedIn = students.filter((s) => s.status === "submitted");
  const pending = handedIn.reduce((n, s) => n + s.pending, 0);
  const unapproved = handedIn.reduce((n, s) => n + s.unapproved, 0);

  return (
    <>
      {back}
      <PageHeader
        title={title || "Marking"}
        description={
          results
            ? `${handedIn.length} of ${students.length} students handed in · ${formatMarks(results.totalMarks)} marks`
            : undefined
        }
        action={
          results && (
            <button
              onClick={() => void setPublished(!results.published)}
              disabled={
                busy !== null || (!results.published && handedIn.length === 0)
              }
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                results.published
                  ? "border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              {results.published ? <EyeOff size={16} /> : <Eye size={16} />}
              {results.published ? "Hide the results" : "Publish the results"}
            </button>
          )
        }
      />

      {results?.published && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          The results are published. Students can see their marks, the correct
          answers and your comments.
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Step
          n={1}
          title="Marking schemes for the written questions"
          hint="The AI marks only against a scheme that you have approved. The criteria must add up to the marks of the question."
        >
          <RubricPanel courseId={id} examId={assessmentId} />
        </Step>

        <Step
          n={2}
          title="Mark the exams"
          hint="Multiple choice questions and blank answers are marked at once. The AI marks the written answers and explains every mark. AI marks count only after you approve them."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              onClick={() => void markWithAi()}
              disabled={busy !== null || handedIn.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "mark" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Sparkles size={16} />
              )}
              {busy === "mark" ? "Marking..." : "Mark the exams with AI"}
            </button>
            <button
              onClick={() => void approveAll()}
              disabled={busy !== null || unapproved === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <CheckCheck size={16} />
              Approve all AI marks{unapproved > 0 ? ` (${unapproved})` : ""}
            </button>
          </div>
          {progress && (
            <p className="mt-3 text-xs text-neutral-500">{progress}</p>
          )}
          {handedIn.length === 0 && (
            <p className="mt-3 text-xs text-neutral-500">
              Nobody has handed in yet.
            </p>
          )}
        </Step>

        <Step
          n={3}
          title="Check each student"
          hint="Open a student to read the answers, see why the AI gave each mark, and change any mark."
        >
          {results === null ? (
            <div className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          ) : students.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No students are enrolled in this course yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {students.map((s) => {
                const st = STATUS[s.status];
                return (
                  <li
                    key={s.studentId}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 sm:w-56">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {s.email}
                      </p>
                    </div>
                    <div className="flex flex-1 flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-medium ${st.className}`}
                      >
                        {st.label}
                      </span>
                      {s.status === "submitted" && (
                        <>
                          <span className="font-semibold">
                            {formatMarks(s.total ?? 0)} /{" "}
                            {formatMarks(results.totalMarks)}
                          </span>
                          {s.pending > 0 && (
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {s.pending} waiting for marks
                            </span>
                          )}
                          {s.unapproved > 0 && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                              {s.unapproved} AI marks to approve
                            </span>
                          )}
                          {s.tabSwitches > 0 && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                              {s.tabSwitches} tab switches
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {s.status === "submitted" && (
                      <button
                        onClick={() => setReview(s)}
                        className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      >
                        Check
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {(pending > 0 || unapproved > 0) && !results?.published && (
            <p className="mt-3 text-xs text-neutral-500">
              The results can be published when nothing is waiting for marks and
              every AI mark is approved.
            </p>
          )}
        </Step>
      </div>

      {review && (
        <StudentMarking
          courseId={id}
          examId={assessmentId}
          studentId={review.studentId}
          onClose={() => setReview(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </>
  );
}

export default function MarkingPage() {
  return (
    <RoleGuard role="teacher">
      <Marking />
    </RoleGuard>
  );
}
