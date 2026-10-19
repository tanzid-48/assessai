type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

// Title and short description on the left, an optional button on the right
export default function PageHeader({ title, description, action }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
