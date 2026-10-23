"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, FileText, Key } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MENU_WIDTH = 288;

const ITEMS = [
  {
    kind: "paper",
    label: "Question paper",
    hint: "For the students, without answers",
    icon: FileText,
  },
  {
    kind: "key",
    label: "Answer key",
    hint: "For you, with answers and source pages",
    icon: Key,
  },
] as const;
type Kind = (typeof ITEMS)[number]["kind"];

type Props = {
  courseId: string;
  paperId: string;
  // Used to name the downloaded file
  fileBase: string;
  // True while the paper still has problems. The reason is shown as a tooltip.
  blocked: boolean;
  blockedReason: string;
};

// A button with a small menu that downloads the paper or the answer key as a Word file.
// The menu is drawn on top of the whole page, so no card or panel can hide it.
export default function ExportMenu({
  courseId,
  paperId,
  fileBase,
  blocked,
  blockedReason,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: MENU_WIDTH });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Places the menu under the button and keeps it inside the window, also on small screens
  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    setPos({ top: rect.bottom + 8, left, width });
  }, []);

  // While the menu is open: close it on an outside click or Escape, and follow the button when the window changes
  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  async function download(kind: Kind) {
    setBusy(kind);
    const label = kind === "key" ? "Answer key" : "Question paper";

    try {
      const res = await fetch(
        `${API_URL}/api/courses/${courseId}/papers/${paperId}/export?format=docx&kind=${kind}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not export the paper");
      }

      // Turn the answer into a file and let the browser save it
      const blob = await res.blob();
      const name = `${fileBase} ${label}.docx`
        .replace(/[\\/:*?"<>|]+/g, "")
        .replace(/\s+/g, " ");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`${label} downloaded`);
      setOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not export the paper",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        disabled={blocked}
        title={blocked ? blockedReason : "Download as a Word file"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={16} />
        Export
        <ChevronDown size={14} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="anim-fade-in fixed z-[80] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
          >
            {ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.kind}
                  role="menuitem"
                  onClick={() => download(item.kind)}
                  disabled={busy !== null}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:hover:bg-neutral-800"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {busy === item.kind ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                    ) : (
                      <Icon size={16} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
            <p className="px-3 pb-1.5 pt-1 text-xs text-neutral-400">
              Word file (.docx)
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
