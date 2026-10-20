"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api } from "@/lib/api";

type Material = {
  _id: string;
  name: string;
  type: string;
  size: number;
  pages: number | null;
  topicName: string | null;
  createdAt: string;
};

type Topic = { _id: string; name: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_SIZE = 25 * 1024 * 1024; // must match the server limit

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Props = { courseId: string; topics: Topic[] };

export default function MaterialsPanel({ courseId, topics }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [topicId, setTopicId] = useState("");
  const [uploading, setUploading] = useState(false);
  // The material waiting for confirmation, and the row being deleted right now
  const [toDelete, setToDelete] = useState<Material | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The server checks the login cookie, so the PDF opens only for the people who may see it
  const fileUrl = (id: string) =>
    `${API_URL}/api/courses/${courseId}/materials/${id}/file`;

  const load = useCallback(async () => {
    try {
      const data = await api<{ materials: Material[] }>(
        `/api/courses/${courseId}/materials`,
      );
      setMaterials(data.materials);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not load the materials",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  // Check the file in the browser first, so mistakes are caught before the upload starts
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    if (!picked.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported for now");
      e.target.value = "";
      setFile(null);
      return;
    }
    if (picked.size > MAX_SIZE) {
      toast.error("The file is too large (maximum 25 MB)");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);

    try {
      const form = new FormData();
      if (topicId) form.append("topicId", topicId);
      form.append("file", file);

      const r = await api<{ pages: number; chunks: number }>(
        `/api/courses/${courseId}/materials`,
        {
          method: "POST",
          body: form,
        },
      );
      toast.success(
        `Uploaded: ${r.pages} pages read, ${r.chunks} text chunks saved`,
      );
      setFile(null);
      setTopicId("");
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Close the dialog at once, fade the row while the server works, then it disappears
  async function confirmDelete() {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    setLeavingId(item._id);

    try {
      await api(`/api/courses/${courseId}/materials/${item._id}`, {
        method: "DELETE",
      });
      toast.success("Material deleted");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete the material",
      );
    } finally {
      setLeavingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 dark:border-neutral-800 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold">Course materials</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Slides and notes the AI will use to write questions. PDF files only
            for now.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium dark:bg-neutral-800">
          {materials.length}
        </span>
      </div>

      {/* Upload form */}
      <form
        onSubmit={upload}
        className="grid gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800 sm:px-5 lg:grid-cols-[1fr_16rem_auto] lg:items-center"
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={pickFile}
          disabled={uploading}
          className="w-full min-w-0 cursor-pointer rounded-lg border border-neutral-300 bg-white text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:file:bg-indigo-500/10 dark:file:text-indigo-300"
        />

        <select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          disabled={uploading}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="">No topic</option>
          {topics.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!file || uploading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Upload size={16} />
          )}
          {uploading ? "Reading the PDF..." : "Upload"}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
            <FileText size={18} />
          </div>
          <p className="mt-3 text-sm font-medium">No materials yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            Upload a PDF above to get started.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {materials.map((m) => (
            <li
              key={m._id}
              className={`anim-row-in flex items-center gap-3 px-4 py-3 transition-opacity duration-200 sm:px-5 ${
                leavingId === m._id ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <FileText size={18} />
              </div>
              <div className="min-w-0 flex-1">
                {/* The name opens the PDF in a new tab */}
                <a
                  href={fileUrl(m._id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium hover:text-indigo-600 hover:underline dark:hover:text-indigo-300"
                >
                  {m.name}
                </a>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                  <span>
                    {m.pages ? `${m.pages} pages · ` : ""}
                    {formatSize(m.size)}
                  </span>
                  <span>{formatDate(m.createdAt)}</span>
                  {m.topicName && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                      {m.topicName}
                    </span>
                  )}
                </p>
              </div>
              <a
                href={fileUrl(m._id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${m.name}`}
                title="Open PDF"
                className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
              >
                <ExternalLink size={16} />
              </a>
              <button
                onClick={() => setToDelete(m)}
                aria-label={`Delete ${m.name}`}
                title="Delete"
                className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this material?"
        message={
          toDelete
            ? `"${toDelete.name}" and the text chunks made from it will be removed.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
