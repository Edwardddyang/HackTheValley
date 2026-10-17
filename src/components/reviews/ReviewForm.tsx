"use client";

import React, { useState } from "react";

interface ReviewFormProps {
  onAddReview?: (review: { author: string; rating: number; comment: string }) => void;
}

export function ReviewForm({ onAddReview }: ReviewFormProps) {
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    if (onAddReview) {
      onAddReview({ author: author.trim() || "Anonymous Tenant", rating, comment });
    }

    setSubmitted(true);
    setAuthor("");
    setComment("");
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
        Submit Tenant Feedback
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label htmlFor="review-author" className="block text-slate-500 mb-1">
            Display Name (Optional)
          </label>
          <input
            id="review-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. Unit 4B Resident"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0D9488]"
          />
        </div>

        <div>
          <label htmlFor="review-rating" className="block text-slate-500 mb-1">
            Rating
          </label>
          <select
            id="review-rating"
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0D9488]"
          >
            <option value={5}>5 - Excellent</option>
            <option value={4}>4 - Good</option>
            <option value={3}>3 - Average</option>
            <option value={2}>2 - Poor</option>
            <option value={1}>1 - Deficient</option>
          </select>
        </div>
      </div>

      <div className="text-xs">
        <label htmlFor="review-comment" className="block text-slate-500 mb-1">
          Review Comments
        </label>
        <textarea
          id="review-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience with building maintenance, management response, or utilities..."
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0D9488]"
          required
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-slate-400 italic">
          Submissions are stored locally for demonstration purposes.
        </span>
        <button
          type="submit"
          className="px-4 py-2 bg-[#142D4E] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
        >
          {submitted ? "Submitted!" : "Post Review"}
        </button>
      </div>
    </form>
  );
}