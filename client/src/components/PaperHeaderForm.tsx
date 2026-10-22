"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export type PaperHeader = {
  title: string;
  program: string;
  batch: string;
  semester: string;
  durationMinutes: number;
  instructions: string;
  coLabel: string;
};

type Props = {
  courseId: string;
  paperId: string;
  header: PaperHeader;
  onSaved: () => void;
};

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium text-neutral-500">
      {children}
    </span>
  );
}

// Edits the printed header of a paper. Only the fields that changed are sent.
export default function PaperHeaderForm({
  courseId,
  paperId,
  header,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(header.title);
  const [program, setProgram] = useState(header.program);
  const [batch, setBatch] = useState(header.batch);
  const [semester, setSemester] = useState(header.semester);
  const [minutes, setMinutes] = useState(String(header.durationMinutes));
  const [instructions, setInstructions] = useState(header.instructions);
  const [coLabel, setCoLabel] = useState(header.coLabel);
  const [busy, setBusy] = useState(false);

  const changes: Record<string, unknown> = {};
  if (title.trim() !== header.title) changes.title = title.trim();
  if (program.trim() !== header.program) changes.program = program.trim();
  if (batch.trim() !== header.batch) changes.batch = batch.trim();
  if (semester.trim() !== header.semester) changes.semester = semester.trim();
  if (Number(minutes) !== header.durationMinutes)
    changes.durationMinutes = Number(minutes);
  if (instructions.trim() !== header.instructions)
    changes.instructions = instructions.trim();
  if (coLabel !== header.coLabel) changes.coLabel = coLabel;
  const hasChanges = Object.keys(changes).length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();

    if (title.trim().length < 3)
      return toast.error("Write a title of at least 3 characters");
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 5 || m > 600)
      return toast.error("The time must be between 5 and 600 minutes");

    setBusy(true);
    try {
      await api(`/api/courses/${courseId}/papers/${paperId}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      toast.success("Paper details saved");
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the details",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="anim-fade-in rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
    >
      <h2 className="text-sm font-semibold">Paper details</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2 lg:col-span-4">
          <Label>Title</Label>
          <input
            value={title}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <Label>Program</Label>
          <input
            value={program}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setProgram(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <Label>Batch</Label>
          <input
            value={batch}
            maxLength={30}
            disabled={busy}
            onChange={(e) => setBatch(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <Label>Semester</Label>
          <input
            value={semester}
            maxLength={30}
            disabled={busy}
            onChange={(e) => setSemester(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <Label>Time (minutes)</Label>
          <input
            type="number"
            min={5}
            max={600}
            value={minutes}
            disabled={busy}
            onChange={(e) => setMinutes(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <Label>Outcome label on the paper</Label>
          <select
            value={coLabel}
            disabled={busy}
            onChange={(e) => setCoLabel(e.target.value)}
            className={fieldClass}
          >
            <option value="CO">CO (e.g. CO1)</option>
            <option value="CLO">CLO (e.g. CLO1)</option>
          </select>
        </label>
        <label className="block sm:col-span-2 lg:col-span-4">
          <Label>Instructions printed under the heading</Label>
          <textarea
            rows={2}
            value={instructions}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setInstructions(e.target.value)}
            className={`${fieldClass} resize-y`}
          />
        </label>
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={!hasChanges || busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {busy ? "Saving..." : hasChanges ? "Save details" : "No changes"}
        </button>
      </div>
    </form>
  );
}
