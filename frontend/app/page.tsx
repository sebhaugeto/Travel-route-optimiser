"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadCard } from "@/components/upload-card";
import { RouteSummaryPanel } from "@/components/route-summary";
import { DownloadButton } from "@/components/download-button";
import { Skeleton } from "@/components/ui/skeleton";
import { optimizeRoute, type OptimizeResponse, type ProgressEvent, type JourneyMode, type Store } from "@/lib/api";

// Leaflet doesn't support SSR -- load it client-side only
const RouteMap = dynamic(() => import("@/components/route-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

export default function Home() {
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const handleSubmit = async (
    file: File,
    storesPerDay: number,
    prioritizeRevenue: boolean,
    journeyMode: JourneyMode,
    startAddress: string,
  ) => {
    setIsLoading(true);
    setError(null);
    setProgress(null);
    setDeletedIds(new Set());
    try {
      const data = await optimizeRoute(file, storesPerDay, (p) => setProgress(p), {
        prioritizeRevenue,
        journeyMode,
        startAddress: startAddress.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setProgress(null);
    setDeletedIds(new Set());
  };

  const handleDeleteStore = useCallback((visitOrder: number) => {
    setDeletedIds((prev) => new Set(prev).add(visitOrder));
  }, []);

  const handleRestoreStore = useCallback((visitOrder: number) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(visitOrder);
      return next;
    });
  }, []);

  // Derive active and deleted store lists
  const { activeStores, deletedStores } = useMemo(() => {
    if (!result) return { activeStores: [] as Store[], deletedStores: [] as Store[] };
    const active: Store[] = [];
    const deleted: Store[] = [];
    for (const s of result.stores) {
      if (deletedIds.has(s.visit_order)) {
        deleted.push(s);
      } else {
        active.push(s);
      }
    }
    return { activeStores: active, deletedStores: deleted };
  }, [result, deletedIds]);

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
        <div className="flex items-center gap-2">
          {result && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="size-4" />
              Restart
            </Button>
          )}
          <DownloadButton
            stores={activeStores}
            disabled={!result}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {!result ? (
          /* Upload state */
          <div className="flex items-center justify-center h-full p-6">
            <div className="flex flex-col items-center gap-4">
              <UploadCard onSubmit={handleSubmit} isLoading={isLoading} progress={progress} />
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
              <RouteMap
                stores={activeStores}
                summary={result.summary}
                onDeleteStore={handleDeleteStore}
              />
            </div>

            {/* Sidebar */}
            <div className="w-[360px] shrink-0 p-4 h-full overflow-hidden">
              <RouteSummaryPanel
                summary={result.summary}
                stores={activeStores}
                deletedStores={deletedStores}
                onRestoreStore={handleRestoreStore}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
