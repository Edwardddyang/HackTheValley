import type { Cite as CiteData } from "@/lib/brief";
import { datasetName, num } from "@/lib/format";

/** A small source tag. Hover or focus shows which dataset, file and row the fact came from. */
export function Cite({ cite }: { cite: CiteData | null | undefined }) {
  if (!cite) return null;
  const name = datasetName(cite.dataset);
  let where: string;
  if ("row_count" in cite) {
    where = `${num(cite.row_count)} rows` +
      (cite.sample_rows?.length ? `, e.g. ${cite.sample_rows.map(num).join(", ")}` : "");
  } else if ("column_hood_id" in cite) {
    where = `spreadsheet row ${num(cite.row)}, neighbourhood ${cite.column_hood_id}` +
      (cite.total_row ? ` (total: row ${num(cite.total_row)})` : "");
  } else {
    where = `row ${num(cite.row)}`;
  }
  return (
    <span className="cite">
      <button type="button" aria-label={`Source: ${name.long}, ${where}`}>
        {name.short}
      </button>
      <span className="cite-tip" role="tooltip">
        <span className="block font-semibold">{name.long}</span>
        <span className="block opacity-80">{cite.file}</span>
        <span className="block opacity-80">{where}</span>
      </span>
    </span>
  );
}
