import type { ReactNode } from "react";

import { InfoTip } from "@/components/InfoTip";

/** The mark on every part of the page Gemini writes or reads: a short label, with what the AI did (and its limits)
 *  behind the info button. */
export function PoweredByGemini({ children, above = false }: { children: ReactNode; above?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      Powered by Gemini
      <InfoTip label="About the AI" above={above}>{children}</InfoTip>
    </span>
  );
}
