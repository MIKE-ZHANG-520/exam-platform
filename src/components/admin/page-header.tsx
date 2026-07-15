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
    <div className="mb-6 flex items-start justify-between gap-4 animate-fade-in-up">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 w-10 h-10 rounded-xl bg-gradient-to-br from-[#1677ff] to-[#0958d9] flex items-center justify-center shadow-md shadow-blue-100 shrink-0">
            <span className="text-white">{icon}</span>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {title}
          </h1>
          {desc && <p className="mt-1 text-sm text-gray-500">{desc}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
