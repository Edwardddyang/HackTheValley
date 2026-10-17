interface LoadingSkeletonProps {
  className?: string;
  count?: number;
}

export function LoadingSkeleton({ className = "h-4 w-full", count = 1 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className={`bg-slate-200/80 rounded-md ${className}`} />
      ))}
    </div>
  );
}