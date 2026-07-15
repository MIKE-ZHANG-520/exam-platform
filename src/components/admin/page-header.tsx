interface Props {
  title: string;
  description?: string;
  right?: React.ReactNode;
}

export function PageHeader({ title, description, right }: Props) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-[#1F2937]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[#667085]">{description}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
