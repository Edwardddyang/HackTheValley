import type { Cite as CiteData } from "@/lib/brief";
import { DATASETS } from "@/lib/datasets";
import { datasetName, num } from "@/lib/format";

/**
 * A small source tag. Hover or focus says, in plain words, where the fact comes from; clicking opens that
 * dataset's public page. The file and row stay in small print, so the exact record can still be traced.
 */
export function Cite({ cite }: { cite: CiteData | null | undefined }) {
  if (!cite) return null;
  const name = datasetName(cite.dataset);
  const info = DATASETS.find((d) => d.key === cite.dataset);
  let where: string;
  if ("row_count" in cite) {
    where = `${num(cite.row_count)} rows` +
      (cite.sample_rows?.length ? `, e.g. ${cite.sample_rows.map(num).join(", ")}` : "");
  } else if ("column_hood_id" in cite) {
    where = `row ${num(cite.row)}, neighbourhood ${cite.column_hood_id}`;
  } else {
    where = `row ${num(cite.row)}`;
  }
  const tip = (
    <span className="cite-tip" role="tooltip">
      <span className="block font-semibold">{info?.name ?? name.long}</span>
      {info && <span className="block opacity-90">{info.publisher}</span>}
      <span className="mt-1 block text-[0.6875rem] opacity-70">{cite.file} · {where}</span>
      {info && <span className="mt-1 block text-[0.6875rem] font-medium text-teal-200">Click to open the dataset ↗</span>}
    </span>
  );
  return (
    <span className="cite">
      {info ? (
        <a className="cite-tag" href={info.url} target="_blank" rel="noopener noreferrer"
          aria-label={`Source: ${info.name}, ${where}. Opens the dataset page in a new tab`}>
          {name.short}
        </a>
      ) : (
        <button type="button" className="cite-tag" aria-label={`Source: ${name.long}, ${where}`}>{name.short}</button>
      )}
      {tip}
    </span>
  );
}
