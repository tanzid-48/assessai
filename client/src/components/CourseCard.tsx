import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prefixFor } from "@/lib/courseStyle";

type Props = {
  code: string;
  title: string;
  credits: number;
  // When given, the whole card becomes a link
  href?: string;
  // Optional footer, e.g. the teacher dropdown on the admin page
  children?: React.ReactNode;
};

// One small card used for a course on every page
export default function CourseCard({
  code,
  title,
  credits,
  href,
  children,
}: Props) {
  const card = (
    <div className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          {prefixFor(code)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {code} · {credits} credits
          </p>
        </div>
        {href && (
          <ChevronRight size={16} className="mt-1 shrink-0 text-neutral-400" />
        )}
      </div>

      {children && (
        <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          {children}
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
