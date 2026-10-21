"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import MaterialsPanel from "@/components/MaterialsPanel";
import { api } from "@/lib/api";
import { ArrowLeft, Library, Plus, Trash2 } from "lucide-react";

type Clo = { _id: string; code: string; text: string };
type Topic = { _id: string; name: string };
type Outline = {
  course: { _id: string; code: string; title: string };
  clos: Clo[];
  topics: Topic[];
};

// One row inside a panel
type Item = { id: string; badge?: string; label: string };

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

// Shorten long text for the confirm dialog
function shorten(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type PanelProps = {
  title: string;
  hint: string;
  placeholder: string;
  maxLength: number;
  multiline?: boolean;
  items: Item[];
  emptyText: string;
  onAdd: (value: string) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
};

// A card with an add form and a list. Used for both CLOs and topics.
function Panel({
  title,
  hint,
  placeholder,
  maxLength,
  multiline,
  items,
  emptyText,
  onAdd,
  onDelete,
}: PanelProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // The row waiting for confirmation, and the row being deleted right now
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onAdd(value.trim());
      setValue("");
    } catch {
      // The page shows the error, so the text stays for another try
    } finally {
      setBusy(false);
    }
  }

  // Close the dialog at once, fade the row while the server works, then it disappears
  async function confirmDelete() {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    setLeavingId(item.id);
    try {
      await onDelete(item);
    } catch {
      // The page shows the error and the row comes back to normal
    } finally {
      setLeavingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 dark:border-neutral-800 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium dark:bg-neutral-800">
          {items.length}
        </span>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-2 border-b border-neutral-200 p-4 dark:border-neutral-800 sm:flex-row sm:px-5"
      >
        {multiline ? (
          <textarea
            rows={2}
            maxLength={maxLength}
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${fieldClass} resize-none`}
          />
        ) : (
          <input
            maxLength={maxLength}
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={fieldClass}
          />
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Plus size={16} />
          )}
          {busy ? "Adding..." : "Add"}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutral-500">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {items.map((item) => (
            <li
              key={item.id}
              className={`anim-row-in flex items-start gap-3 px-4 py-3 transition-opacity duration-200 sm:px-5 ${
                leavingId === item.id ? "pointer-events-none opacity-40" : ""
              }`}
            >
              {item.badge && (
                <span className="mt-0.5 shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {item.badge}
                </span>
              )}
              <p className="min-w-0 flex-1 text-sm leading-relaxed">
                {item.label}
              </p>
              <button
                onClick={() => setToDelete(item)}
                aria-label={`Delete ${item.badge ?? item.label}`}
                title="Delete"
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete ${toDelete?.badge ?? "this item"}?`}
        message={
          toDelete
            ? `"${shorten(toDelete.label)}" will be removed from this course.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}

function CourseOutline() {
  const { id } = useParams<{ id: string }>();

  const [outline, setOutline] = useState<Outline | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<Outline>(`/api/courses/${id}/outline`);
      setOutline(data);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Could not load this course",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Run one change (add or delete), reload the outline and tell the user.
  // On failure the message is shown and the error is passed on to the panel.
  async function change(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      await load();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      throw e;
    }
  }

  const back = (
    <Link
      href="/teacher"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      <ArrowLeft size={14} />
      Back to dashboard
    </Link>
  );

  if (loading) {
    return (
      <>
        {back}
        <div className="h-8 w-64 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-64 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </>
    );
  }

  if (loadError || !outline) {
    return (
      <>
        {back}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          {loadError || "Could not load this course"}
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader
        title={outline.course.title}
        description={outline.course.code}
        action={
          <Link
            href={`/teacher/courses/${id}/questions`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Library size={16} />
            Question bank
          </Link>
        }
      />

      <div className="mt-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        Every question the AI generates is linked to a CLO and a topic. Add them
        here before uploading materials.
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Learning outcomes (CLOs)"
          hint="What students should be able to do after this course."
          placeholder="e.g. Explain the basic steps of digital image processing"
          maxLength={300}
          multiline
          emptyText="No CLOs yet. Add the first one above."
          items={outline.clos.map((c) => ({
            id: c._id,
            badge: c.code,
            label: c.text,
          }))}
          onAdd={(text) =>
            change(
              () =>
                api(`/api/courses/${id}/clos`, {
                  method: "POST",
                  body: JSON.stringify({ text }),
                }),
              "CLO added",
            )
          }
          onDelete={(item) =>
            change(
              () =>
                api(`/api/courses/${id}/clos/${item.id}`, { method: "DELETE" }),
              "CLO deleted",
            )
          }
        />

        <Panel
          title="Topics"
          hint="The chapters or themes the materials and questions belong to."
          placeholder="e.g. Image Enhancement"
          maxLength={100}
          emptyText="No topics yet. Add the first one above."
          items={outline.topics.map((t) => ({ id: t._id, label: t.name }))}
          onAdd={(name) =>
            change(
              () =>
                api(`/api/courses/${id}/topics`, {
                  method: "POST",
                  body: JSON.stringify({ name }),
                }),
              "Topic added",
            )
          }
          onDelete={(item) =>
            change(
              () =>
                api(`/api/courses/${id}/topics/${item.id}`, {
                  method: "DELETE",
                }),
              "Topic deleted",
            )
          }
        />
      </div>

      {/* Materials: PDF upload, list and delete */}
      <div className="mt-6">
        <MaterialsPanel courseId={outline.course._id} topics={outline.topics} />
      </div>
    </>
  );
}

export default function TeacherCoursePage() {
  return (
    <RoleGuard role="teacher">
      <CourseOutline />
    </RoleGuard>
  );
}
