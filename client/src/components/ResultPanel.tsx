"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { api } from "@/lib/api";

// Shows the total on the "handed in" page, but only after the teacher has published the results
export default function ResultPanel({ examId }: { examId: string }) {
  const [result, setResult] = useState<{
    total: number;
    totalMarks: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ total: number; totalMarks: number }>(`/api/exams/${examId}/result`)
      .then((d) => {
        if (!cancelled) setResult(d);
      })
      .catch(() => {
        // Not published yet, so there is nothing to show
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  if (!result) return null;

  return (
    <div className="anim-fade-in mx-auto mt-6 max-w-sm rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <Trophy size={16} />
        Your result is published
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">
        {Number.isInteger(result.total)
          ? result.total
          : result.total.toFixed(1)}
        <span className="text-lg font-medium text-neutral-500">
          {" "}
          / {result.totalMarks}
        </span>
      </p>
      <Link
        href={`/student/exams/${examId}/result`}
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
      >
        See every mark and comment
      </Link>
    </div>
  );
}
