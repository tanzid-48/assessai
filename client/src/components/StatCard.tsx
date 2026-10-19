import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
};

// Compact card: icon on the left, number and label on the right
export default function StatCard({ label, value, icon: Icon }: Props) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-none tracking-tight">
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}
