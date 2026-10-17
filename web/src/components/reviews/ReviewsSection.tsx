"use client";

import { useState } from "react";

import { ReviewForm } from "./ReviewForm";

// From feature/frontend-ui (ogd-ola). The fictional sample reviews are left out: next to real
// City data they would read as real. Reviews arrive once storage and moderation exist.
export function ReviewsSection() {
  const [showForm, setShowForm] = useState(false);
  return (
    <section id="reviews" aria-label="Tenant reviews"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-[#142D4E]">Tenant reviews</h2>
        <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">Coming soon</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Unverified community feedback and resident experiences.</p>
      <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        No reviews yet. Tenant reviews will appear here once posting is available.
      </p>
      {showForm ? <ReviewForm /> : (
        <button type="button" onClick={() => setShowForm(true)}
          className="mt-5 text-sm font-semibold text-teal-700 transition hover:text-teal-800">
          + Preview the review form
        </button>
      )}
      <p className="mt-6 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">
        Reviews are subjective opinions of contributors and do not represent verified City inspections or formal tenancy dispute determinations.
      </p>
    </section>
  );
}
