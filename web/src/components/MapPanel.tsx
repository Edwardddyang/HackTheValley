"use client";

import dynamic from "next/dynamic";

import type { Brief } from "@/lib/brief";

// MapLibre needs the browser (window, WebGL), so the map only renders on the client.
const BriefMap = dynamic(() => import("./BriefMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl border border-border bg-surface-2" />,
});

export function MapPanel(props: { brief: Brief; typeLabels: Record<string, string> }) {
  return <BriefMap {...props} />;
}
