type Props = {
  percent: number | null;
  // Scores below this are shown in amber (the server calls them weak)
  weakBelow?: number;
};

// A thin bar with the percentage on its right. A topic without any score shows a short note instead.
export default function ScoreBar({ percent, weakBelow = 70 }: Props) {
  if (percent === null) {
    return <span className="text-xs text-neutral-400">No score yet</span>;
  }
  const weak = percent < weakBelow;

  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            weak ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={`w-10 shrink-0 text-right text-xs font-semibold tabular-nums ${
          weak
            ? "text-amber-600 dark:text-amber-400"
            : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {percent}%
      </span>
    </div>
  );
}
