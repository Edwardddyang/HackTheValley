import type { SourceId } from "@/contracts/types";

interface SourceLinkProps {
  source: SourceId;
  className?: string;
}

export function SourceLink({ source, className = "" }: SourceLinkProps) {
  const [dataset, id] = source.split(":");

  return (
    <div
      className={`text-[11px] text-slate-400 font-mono tracking-tight ${className}`}
      title={`Source dataset: ${dataset}, record: ${id}`}
    >
      Fictional source placeholder; not a municipal citation.
      <div className="text-slate-400/80">{source}</div>
    </div>
  );
}