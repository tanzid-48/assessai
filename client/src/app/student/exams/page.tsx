"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import { api } from "@/lib/api";

type State = "upcoming" | "open" | "closed";
type Row = {
  _id: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  totalMarks: number;
  itemCount: number;
  state: State;
  attempt: {
    status: "in_progress" | "submitted";
    startedAt: string;
    deadline: string;
    submittedAt: string | null;
  } | null;
};

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The label of an exam in the list and what the button does
function describe(x: Row) {
  if (x.attempt?.status === "in_progress") {
    return {
      tag: "In progress",
      tagClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      button: "Continue",
      primary: true,
      enabled: true,
    };
  }
  if (x.attempt?.status === "submitted") {
    return {
      tag: "Submitted",
      tagClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      button: "View",
      primary: false,
      enabled: true,
    };
  }
  if (x.state === "open") {
    return {
      tag: "Open now",
      tagClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      button: "Start",
      primary: true,
      enabled: true,
    };
  }
  if (x.state === "upcoming") {
    return {
      tag: "Upcoming",
      tagClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      button: `Opens ${formatTime(x.startsAt)}`,
      primary: false,
      enabled: false,
    };
  }
  return {
    tag: "Missed",
    tagClass:
      "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    button: "Closed",
    primary: false,
    enabled: false,
  };
}

// Exams that need attention come first
function rank(x: Row) {
  if (x.attempt?.status === "in_progress") return 0;
  if (x.state === "open" && !x.attempt) return 1;
  if (x.state === "upcoming") return 2;
  return 3;
}

function Exams() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the list when the page opens, and again every 30 seconds so the states stay right
  useEffect(() => {
    let cancelled = false;

    const load = () =>
      api<{ exams: Row[] }>("/api/exams")
        .then((d) => {
          if (cancelled) return;
          setRows(d.exams);
          setError("");
        })
        .catch((e) => {
          if (!cancelled)
            setError(
              e instanceof Error ? e.message : "Could not load your exams",
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));

  return (
    <>
      <PageHeader
        title="Exams"
        description="Timed exams of the courses you are enrolled in."
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-14 text-center dark:border-neutral-700">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
              <ClipboardCheck size={18} />
            </div>
            <p className="mt-3 text-sm font-medium">No exams yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Exams that your teachers set for your courses will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sorted.map((x) => {
              const d = describe(x);
              return (
                <li
                  key={x._id}
                  className="anim-row-in flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500">
                      {x.courseCode} · {x.courseTitle}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {x.title}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.tagClass}`}
                      >
                        {d.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Open {formatTime(x.startsAt)} to {formatTime(x.endsAt)} ·{" "}
                      {x.durationMinutes} min · {formatMarks(x.totalMarks)}{" "}
                      marks
                    </p>
                  </div>

                  {d.enabled ? (
                    <Link
                      href={`/student/exams/${x._id}`}
                      className={`inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        d.primary
                          ? "bg-indigo-600 text-white hover:bg-indigo-500"
                          : "border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {d.button}
                    </Link>
                  ) : (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-500 dark:bg-neutral-800">
                      {d.button}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default function StudentExamsPage() {
  return (
    <RoleGuard role="student">
      <Exams />
    </RoleGuard>
  );
}
