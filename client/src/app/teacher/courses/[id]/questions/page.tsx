"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditQuestionDialog from "@/components/EditQuestionDialog";
import GeneratePanel from "@/components/GeneratePanel";
import QuestionCard, { type Question } from "@/components/QuestionCard";
import { api } from "@/lib/api";

type Counts = { pending: number; approved: number; rejected: number };
type Status = Question["status"];
type Outline = {
  course: { code: string; title: string };
  clos: { _id: string; code: string; text: string }[];
  topics: { _id: string; name: string }[];
};

const TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const selectClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

function QuestionBank() {
  const { id } = useParams<{ id: string }>();
  const [outline, setOutline] = useState<Outline | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [status, setStatus] = useState<Status>("pending");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  // Changing this number makes the list load again
  const [refresh, setRefresh] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Question | null>(null);
  // The question that is open in the edit dialog
  const [editing, setEditing] = useState<Question | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status, limit: "100" });
      if (type) params.set("type", type);
      const data = await api<{ counts: Counts; questions: Question[] }>(
        `/api/courses/${id}/questions?${params}`,
      );
      setQuestions(data.questions);
      setCounts(data.counts);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not load the questions",
      );
    } finally {
      setLoading(false);
    }
  }, [id, status, type]);

  useEffect(() => {
    load();
  }, [load, refresh]);

  // The course name, the topics and the CLOs are needed for the header, the generate form and the edit dialog
  useEffect(() => {
    api<Outline>(`/api/courses/${id}/outline`)
      .then(setOutline)
      .catch(() => {});
  }, [id]);

  // Search is done in the browser on the loaded questions
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? questions.filter((x) => x.text.toLowerCase().includes(q))
      : questions;
  }, [questions, search]);

  // New questions are always "pending" and the newest comes first, so show that list
  function handleGenerated() {
    setStatus("pending");
    setType("");
    setSearch("");
    setLoading(true);
    setRefresh((n) => n + 1);
  }

  async function setQuestionStatus(q: Question, next: Status) {
    setBusyId(q._id);
    try {
      await api(`/api/courses/${id}/questions/${q._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      toast.success(
        next === "approved"
          ? "Question approved"
          : next === "rejected"
            ? "Question rejected"
            : "Moved back to pending",
      );
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update the question",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const q = toDelete;
    setToDelete(null);
    setBusyId(q._id);
    try {
      await api(`/api/courses/${id}/questions/${q._id}`, { method: "DELETE" });
      toast.success("Question deleted");
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not delete the question",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Link
        href={`/teacher/courses/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft size={14} />
        Back to course
      </Link>

      <PageHeader
        title="Question bank"
        description={
          outline
            ? `${outline.course.code} · ${outline.course.title}`
            : undefined
        }
        action={
          <button
            onClick={() => setShowGenerate((v) => !v)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {showGenerate ? <X size={16} /> : <Sparkles size={16} />}
            {showGenerate ? "Close" : "Generate questions"}
          </button>
        }
      />

      {/* Generate form (hidden until the button is pressed) */}
      {showGenerate && outline && (
        <div className="mt-6">
          <GeneratePanel
            courseId={id}
            topics={outline.topics}
            clos={outline.clos}
            onGenerated={handleGenerated}
          />
        </div>
      )}

      {/* Status tabs */}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setStatus(t.key);
              setLoading(true);
            }}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              status === t.key
                ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            type="search"
            placeholder="Search the questions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${selectClass} w-full pl-9`}
          />
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setLoading(true);
          }}
          className={selectClass}
        >
          <option value="">All types</option>
          <option value="mcq">MCQ</option>
          <option value="short">Short</option>
          <option value="broad">Broad</option>
        </select>
      </div>

      {/* List */}
      <div className="mt-5 space-y-4">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
            />
          ))
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-14 text-center dark:border-neutral-700">
            <p className="text-sm font-medium">
              {search
                ? "No question matches your search"
                : `No ${status} questions`}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {status === "pending" && !search
                ? 'Press "Generate questions" above. New questions wait here until you approve them.'
                : "Questions you move here will appear in this list."}
            </p>
          </div>
        ) : (
          visible.map((q) => (
            <QuestionCard
              key={q._id}
              question={q}
              busy={busyId === q._id}
              onStatus={(next) => setQuestionStatus(q, next)}
              onEdit={() => setEditing(q)}
              onDelete={() => setToDelete(q)}
            />
          ))
        )}
      </div>

      <EditQuestionDialog
        question={editing}
        courseId={id}
        clos={outline?.clos ?? []}
        topics={outline?.topics ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this question?"
        message={
          toDelete
            ? `"${toDelete.text.slice(0, 90)}${toDelete.text.length > 90 ? "…" : ""}" will be removed for good.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

export default function QuestionBankPage() {
  return (
    <RoleGuard role="teacher">
      <QuestionBank />
    </RoleGuard>
  );
}
