"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import PaperHeaderForm from "@/components/PaperHeaderForm";
import QuestionPicker from "@/components/QuestionPicker";
import type { Question } from "@/components/QuestionCard";
import { api } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";

type PaperQuestion = {
  _id: string;
  type: "mcq" | "short" | "broad";
  text: string;
  options: string[] | null;
  difficulty: string;
  bloom: string;
  cloId: string;
  cloCode: string;
  topicId: string;
  topicName: string | null;
  status: string;
};
type Part = {
  marks: number;
  question: PaperQuestion | null;
  orQuestion: PaperQuestion | null;
};
type Detail = {
  paper: {
    _id: string;
    title: string;
    program: string;
    batch: string;
    semester: string;
    durationMinutes: number;
    instructions: string;
    coLabel: string;
    totalMarks: number;
    questions: { parts: Part[] }[];
  };
  coverage: {
    totalMarks: number;
    filledMarks: number;
    topics: { id: string; name: string; marks: number }[];
    clos: { id: string; code: string; marks: number }[];
  };
  problems: string[];
};

// The slot the picker is open for
type Target = { qi: number; pi: number; kind: "main" | "or" };

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

// The question list as the server expects it, with the ids only
function toStructure(questions: Detail["paper"]["questions"]) {
  return questions.map((q) => ({
    parts: q.parts.map((p) => ({
      marks: p.marks,
      questionId: p.question?._id ?? null,
      orQuestionId: p.orQuestion?._id ?? null,
    })),
  }));
}

// One bar of the coverage panel
function Bar({
  label,
  marks,
  total,
}: {
  label: string;
  marks: number;
  total: number;
}) {
  const percent =
    total > 0 ? Math.min(100, Math.round((marks / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">{label}</span>
        <span
          className={
            marks === 0
              ? "shrink-0 text-amber-600 dark:text-amber-400"
              : "shrink-0 text-neutral-500"
          }
        >
          {formatMarks(marks)} {marks === 0 ? "· not covered" : "marks"}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-indigo-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function PaperEditor() {
  const { id, paperId } = useParams<{ id: string; paperId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`/api/courses/${id}/papers/${paperId}`));
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Could not load this paper",
      );
    } finally {
      setLoading(false);
    }
  }, [id, paperId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ids of every question that is already in this paper
  const usedIds = useMemo(() => {
    const ids: string[] = [];
    for (const q of detail?.paper.questions ?? []) {
      for (const p of q.parts) {
        if (p.question) ids.push(p.question._id);
        if (p.orQuestion) ids.push(p.orQuestion._id);
      }
    }
    return ids;
  }, [detail]);

  // Sends the whole list of questions to the server, then shows the answer (with a fresh coverage)
  async function saveStructure(
    next: ReturnType<typeof toStructure>,
    success: string,
  ) {
    setSaving(true);
    try {
      const d = await api<Detail>(`/api/courses/${id}/papers/${paperId}`, {
        method: "PATCH",
        body: JSON.stringify({ questions: next }),
      });
      setDetail(d);
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the change");
    } finally {
      setSaving(false);
    }
  }

  function place(question: Question) {
    if (!detail || !target) return;
    const next = toStructure(detail.paper.questions);
    const part = next[target.qi].parts[target.pi];
    if (target.kind === "main") part.questionId = question._id;
    else part.orQuestionId = question._id;

    setTarget(null);
    saveStructure(
      next,
      target.kind === "main" ? "Question added" : "Choice (Or) added",
    );
  }

  function clear(qi: number, pi: number, kind: "main" | "or") {
    if (!detail) return;
    const next = toStructure(detail.paper.questions);
    const part = next[qi].parts[pi];
    if (kind === "main") {
      // The choice cannot stay without its main question
      part.questionId = null;
      part.orQuestionId = null;
    } else {
      part.orQuestionId = null;
    }
    saveStructure(next, "Removed from the paper");
  }

  const back = (
    <Link
      href={`/teacher/courses/${id}/papers`}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      <ArrowLeft size={14} />
      Back to papers
    </Link>
  );

  if (loading) {
    return (
      <>
        {back}
        <div className="h-8 w-72 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="h-96 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800 lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </>
    );
  }

  if (loadError || !detail) {
    return (
      <>
        {back}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          {loadError || "Could not load this paper"}
        </div>
      </>
    );
  }

  const { paper, coverage, problems } = detail;
  const label = paper.coLabel;
  const targetPart = target
    ? paper.questions[target.qi]?.parts[target.pi]
    : null;
  const targetTitle =
    target && targetPart
      ? `Question ${target.qi + 1}${paper.questions[target.qi].parts.length > 1 ? ` (${String.fromCharCode(97 + target.pi)})` : ""}${
          target.kind === "or" ? " · choice (Or)" : ""
        } · ${formatMarks(targetPart.marks)} marks`
      : "";

  // A slot of the printed paper: either the question, or a button to choose one
  const slot = (
    qi: number,
    pi: number,
    kind: "main" | "or",
    q: PaperQuestion | null,
    marks: number,
  ) =>
    q ? (
      <div className="anim-row-in flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {q.text}
          </p>
          {q.options && (
            <ol className="mt-1.5 space-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
              {q.options.map((o, i) => (
                <li key={i}>
                  {String.fromCharCode(65 + i)}. {o}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-1.5 text-xs text-neutral-500">
            {q.topicName}
            {q.status !== "approved" && (
              <span className="ml-2 font-medium text-red-500">
                · not approved any more
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold">{formatMarks(marks)}</span>
          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
            {q.cloCode.replace(/^CLO/, label)}
          </span>
          <button
            onClick={() => clear(qi, pi, kind)}
            disabled={saving}
            aria-label="Remove this question from the paper"
            title="Remove"
            className="mt-1 rounded-md p-1 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setTarget({ qi, pi, kind })}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500 transition-colors hover:border-indigo-500 hover:text-indigo-600 disabled:opacity-50 dark:border-neutral-700 dark:hover:text-indigo-300"
        >
          <Plus size={15} />
          {kind === "main" ? "Choose question" : "Add a choice (Or)"}
        </button>
        {kind === "main" && (
          <span className="text-sm font-semibold text-neutral-400">
            {formatMarks(marks)}
          </span>
        )}
      </div>
    );

  return (
    <>
      {back}
      <PageHeader
        title={paper.title}
        description={`${formatMarks(paper.totalMarks)} marks · ${paper.durationMinutes} minutes${
          paper.batch ? ` · ${paper.batch} batch` : ""
        }${paper.semester ? ` · ${paper.semester} semester` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <ExportMenu
              courseId={id}
              paperId={paperId}
              fileBase={paper.title}
              blocked={problems.length > 0}
              blockedReason={`${problems.length} thing${problems.length === 1 ? "" : "s"} to fix before exporting`}
            />
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {showDetails ? <X size={16} /> : <Pencil size={16} />}
              {showDetails ? "Close" : "Edit details"}
            </button>
          </div>
        }
      />

      {showDetails && (
        <div className="mt-6">
          <PaperHeaderForm
            key={`${paper.title}|${paper.coLabel}|${paper.durationMinutes}`}
            courseId={id}
            paperId={paperId}
            header={paper}
            onSaved={() => {
              setShowDetails(false);
              load();
            }}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* The paper, laid out like the printed one */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
            <div className="text-center">
              <p className="text-sm font-bold">
                Pundra University of Science &amp; Technology
              </p>
              {paper.program && (
                <p className="mt-1 text-sm">Program: {paper.program}</p>
              )}
              {(paper.batch || paper.semester) && (
                <p className="text-sm">
                  {paper.batch && `Batch: ${paper.batch}`}
                  {paper.batch && paper.semester && ", "}
                  {paper.semester && `Semester: ${paper.semester}`}
                </p>
              )}
              <p className="text-sm font-semibold">{paper.title}</p>
            </div>
            <div className="mt-4 flex justify-between text-sm font-medium">
              <span>Time: {paper.durationMinutes} Minutes</span>
              <span>Full Marks: {formatMarks(paper.totalMarks)}</span>
            </div>
            {paper.instructions && (
              <p className="mt-3 text-xs italic text-neutral-500">
                {paper.instructions}
              </p>
            )}

            <div className="mt-6 space-y-6">
              {paper.questions.map((q, qi) => (
                <div key={qi} className="flex gap-3">
                  <span className="w-5 shrink-0 text-sm font-semibold">
                    {qi + 1}.
                  </span>
                  <div className="min-w-0 flex-1 space-y-4">
                    {q.parts.map((p, pi) => (
                      <div key={pi} className="flex gap-3">
                        {q.parts.length > 1 && (
                          <span className="w-5 shrink-0 text-sm">
                            ({String.fromCharCode(97 + pi)})
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          {slot(qi, pi, "main", p.question, p.marks)}

                          {/* The choice (Or) of this part, only after the main question is chosen */}
                          {p.question && (
                            <div className="mt-3">
                              <p className="mb-2 text-center text-sm font-semibold">
                                Or,
                              </p>
                              {slot(qi, pi, "or", p.orQuestion, p.marks)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side panel: status and coverage */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold">Progress</h2>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={`h-full rounded-full ${coverage.filledMarks === coverage.totalMarks ? "bg-emerald-500" : "bg-indigo-500"}`}
                style={{
                  width: `${coverage.totalMarks ? Math.round((coverage.filledMarks / coverage.totalMarks) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {formatMarks(coverage.filledMarks)} of{" "}
              {formatMarks(coverage.totalMarks)} marks have a question
            </p>
          </div>

          {problems.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle size={16} />
                {problems.length} thing{problems.length === 1 ? "" : "s"} to fix
              </div>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-700 dark:text-amber-300">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
                Export becomes available when this list is empty.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold">Topic coverage</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Marks per topic (the choice Or is not counted)
            </p>
            <div className="mt-3 space-y-3">
              {coverage.topics.map((t) => (
                <Bar
                  key={t.id}
                  label={t.name}
                  marks={t.marks}
                  total={coverage.totalMarks}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold">{label} coverage</h2>
            <div className="mt-3 space-y-3">
              {coverage.clos.map((c) => (
                <Bar
                  key={c.id}
                  label={c.code.replace(/^CLO/, label)}
                  marks={c.marks}
                  total={coverage.totalMarks}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>

      <QuestionPicker
        open={target !== null}
        courseId={id}
        title={targetTitle}
        usedIds={usedIds}
        onPick={place}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

export default function PaperPage() {
  return (
    <RoleGuard role="teacher">
      <PaperEditor />
    </RoleGuard>
  );
}
