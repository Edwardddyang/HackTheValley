"use client";

// From feature/frontend-ui (ogd-ola). Posting is switched off until reviews have storage and
// moderation; the form is shown so the feature is visible, and says so plainly.
export function ReviewForm() {
  return (
    <form
      aria-describedby="review-coming-soon"
      onSubmit={(e) => e.preventDefault()}
      className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase">Submit tenant feedback</h3>
      <fieldset disabled className="space-y-3 opacity-70">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div>
            <label htmlFor="review-author" className="mb-1 block text-slate-500">Display name (optional)</label>
            <input id="review-author" type="text" placeholder="e.g. Unit 4B resident"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700" />
          </div>
          <div>
            <label htmlFor="review-rating" className="mb-1 block text-slate-500">Rating</label>
            <select id="review-rating" defaultValue={5} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
              <option value={5}>5 - Excellent</option>
              <option value={4}>4 - Good</option>
              <option value={3}>3 - Average</option>
              <option value={2}>2 - Poor</option>
              <option value={1}>1 - Deficient</option>
            </select>
          </div>
        </div>
        <div className="text-xs">
          <label htmlFor="review-comment" className="mb-1 block text-slate-500">Review comments</label>
          <textarea id="review-comment" rows={3}
            placeholder="Share your experience with building maintenance, management response, or utilities..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700" />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span id="review-coming-soon" className="text-[11px] text-slate-500">Coming soon: reviews can&apos;t be posted yet.</span>
        <button type="submit" disabled className="cursor-not-allowed rounded-lg bg-[#142D4E] px-4 py-2 text-xs font-semibold text-white opacity-50">
          Post review
        </button>
      </div>
    </form>
  );
}
