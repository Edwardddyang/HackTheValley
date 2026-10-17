"use client";

import React, { useState } from "react";
import { ReviewForm } from "./ReviewForm";

interface ReviewItem {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

const INITIAL_DEMO_REVIEWS: ReviewItem[] = [
  {
    id: "rev-1",
    author: "Long-term Resident (fictional)",
    rating: 4,
    comment: "Heating is generally dependable in winter, though radiator bleeding was needed in late November. Superintendent is responsive to plumbing tickets.",
    date: "2025-12-14",
  },
  {
    id: "rev-2",
    author: "3rd Floor Tenant (fictional)",
    rating: 3,
    comment: "Common hallways are regularly vacuumed, but recycling bins in the back alley often overflow before scheduled pickup days.",
    date: "2026-01-22",
  },
];

export function ReviewsSection() {
  const [reviews, setReviews] = useState<ReviewItem[]>(INITIAL_DEMO_REVIEWS);
  const [showForm, setShowForm] = useState(false);

  const handleAddReview = (newRev: { author: string; rating: number; comment: string }) => {
    const created: ReviewItem = {
      id: `rev-${Date.now()}`,
      author: newRev.author,
      rating: newRev.rating,
      comment: newRev.comment,
      date: new Date().toISOString().split("T")[0],
    };
    setReviews([created, ...reviews]);
    setShowForm(false);
  };

  return (
    <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#142D4E]">Tenant reviews</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
            Demo data — illustrative only
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          Unverified community feedback and resident experiences.
        </p>

        <div className="space-y-4">
          {reviews.map((rev) => (
            <div key={rev.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">{rev.author}</span>
                <span className="text-slate-400 text-[11px]">{rev.date}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
                {"★".repeat(rev.rating)}
                {"☆".repeat(5 - rev.rating)}
                <span className="text-slate-500 font-normal ml-1">({rev.rating}/5)</span>
              </div>
              <p className="text-slate-600 leading-relaxed pt-1">
                {rev.comment}
              </p>
            </div>
          ))}
        </div>

        {showForm ? (
          <ReviewForm onAddReview={handleAddReview} />
        ) : (
          <div className="mt-5">
            <button
              onClick={() => setShowForm(true)}
              className="text-xs font-semibold text-[#0D9488] hover:text-teal-700 transition"
            >
              + Write a review for this building
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100 leading-relaxed">
        Reviews are subjective opinions of contributors and do not represent verified city inspections or formal tenancy dispute determinations.
      </p>
    </div>
  );
}