"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { UploadCard } from "@/components/upload-card";
import { RouteSummaryPanel } from "@/components/route-summary";
import { DownloadButton } from "@/components/download-button";
import { Skeleton } from "@/components/ui/skeleton";
import { optimizeRoute, type OptimizeResponse } from "@/lib/api";

// Leaflet doesn't support SSR -- load it client-side only
const RouteMap = dynamic(() => import("@/components/route-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

export default function Home() {
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (file: File, storesPerDay: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await optimizeRoute(file, storesPerDay);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <MapPin className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Travel Route Optimizer</h1>
        </button>
        <DownloadButton
          csvBase64={result?.csv_download ?? null}
          disabled={!result}
        />
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {!result ? (
          /* Upload state */
          <div className="flex items-center justify-center h-full p-6">
            <div className="flex flex-col items-center gap-4">
              <UploadCard onSubmit={handleSubmit} isLoading={isLoading} />
              {error && (
                <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Results state: map + sidebar */
          <div className="flex h-full">
            {/* Map */}
            <div className="flex-1 p-4 pr-0">
              <RouteMap stores={result.stores} />
            </div>

            {/* Sidebar */}
            <div className="w-[360px] shrink-0 p-4 h-full overflow-hidden">
              <RouteSummaryPanel
                summary={result.summary}
                stores={result.stores}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
