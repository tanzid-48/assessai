type Props = {
  label: string;
  value: string | number;
  gradient: string;
  icon: string;
};

// Small card showing one number with an icon
export default function StatCard({ label, value, gradient, icon }: Props) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-xl ${gradient}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1.5 text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}
