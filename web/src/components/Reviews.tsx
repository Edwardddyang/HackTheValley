import { Section } from "./ui";

/**
 * Tenant reviews, planned from Daniel's feature/frontend-ui design. Submissions and storage aren't
 * built yet, so this is an honest placeholder: no sample reviews, nothing that could read as a
 * record. When it ships, reviews stay unverified opinion, clearly separated from the City data.
 */
export function ReviewsSection() {
  return (
    <Section id="reviews" title="Tenant reviews"
      subtitle="Coming soon. Reviews will be unverified, user-submitted opinion — kept clearly apart from the records above, never presented as official data.">
      <p className="max-w-[64ch] text-[15px] text-ink-2">
        Until submissions open, this brief shows only what&apos;s in the public records. If you&apos;ve lived here and want
        to compare notes, ask the landlord for references and talk to current tenants at the viewing.
      </p>
      <button type="button" disabled
        className="mt-4 cursor-not-allowed rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink-3">
        Write a review (coming soon)
      </button>
    </Section>
  );
}
