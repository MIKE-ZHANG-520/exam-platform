interface Props {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, description, icon, right }: Props) {
  const desc = subtitle ?? description;
  return (
    <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between animate-fade-in-up">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="mt-0.5 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#1677ff] to-[#0958d9] flex items-center justify-center shadow-md shadow-blue-100 shrink-0">
            <span className="text-white">{icon}</span>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight leading-snug">
            {title}
          </h1>
          {desc && <p className="mt-1 text-sm text-gray-500">{desc}</p>}
        </div>
      </div>
      {right && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {right}
        </div>
      )}
    </div>
  );
}
