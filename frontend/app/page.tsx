"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadCard } from "@/components/upload-card";
import { RouteSummaryCard, StoreOrderCard } from "@/components/route-summary";
import { DownloadButton } from "@/components/download-button";
import { Skeleton } from "@/components/ui/skeleton";
import { optimizeRoute, waitForBackend, type OptimizeResponse, type ProgressEvent, type JourneyMode, type Store } from "@/lib/api";

// Leaflet doesn't support SSR -- load it client-side only
const RouteMap = dynamic(() => import("@/components/route-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

const WARM_UP_TIPS = [
  "Warming up the route optimizer...",
  "Waking up the server — free hosting can be sleepy!",
  "Almost there — preparing the engine...",
  "Still warming up — hang tight!",
  "The server is stretching its legs...",
  "Loading route algorithms...",
  "Connecting to the optimizer...",
];

export default function Home() {
  const [backendReady, setBackendReady] = useState(false);
  const [warmUpTip, setWarmUpTip] = useState(WARM_UP_TIPS[0]);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  // Warm up the backend on first load
  useEffect(() => {
    let tipIdx = 0;
    const tipInterval = setInterval(() => {
      tipIdx = (tipIdx + 1) % WARM_UP_TIPS.length;
      setWarmUpTip(WARM_UP_TIPS[tipIdx]);
    }, 4000);

    waitForBackend()
      .then(() => setBackendReady(true))
      .finally(() => clearInterval(tipInterval));

    return () => clearInterval(tipInterval);
  }, []);

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
      <header className="flex items-center justify-between border-b px-4 sm:px-6 py-3 shrink-0 gap-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0"
        >
          <MapPin className="size-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold truncate">Travel Route Optimizer</h1>
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
            {!backendReady ? (
              /* Warm-up loading screen */
              <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
                <div className="relative flex items-center justify-center">
                  {/* Pulsing ring */}
                  <div className="absolute size-20 rounded-full border-4 border-primary/20 animate-ping" />
                  <div className="relative size-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin className="size-7 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 max-w-xs text-center">
                  <p className="text-sm font-medium text-foreground transition-all duration-300">
                    {warmUpTip}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This can take up to 50 seconds on first visit
                  </p>
                </div>
                {/* Animated dots */}
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="size-2 rounded-full bg-primary/60"
                      style={{
                        animation: "bounce 1.4s infinite ease-in-out",
                        animationDelay: `${i * 0.16}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <UploadCard onSubmit={handleSubmit} isLoading={isLoading} progress={progress} />
                {error && (
                  <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Results state: responsive layout */
          <>
            {/* ---- Mobile layout (vertical scroll) ---- */}
            <div className="lg:hidden flex flex-col h-full overflow-y-auto">
              {/* Route Summary */}
              <div className="p-4 pb-0">
                <RouteSummaryCard
                  summary={result.summary}
                  stores={activeStores}
                  deletedStores={deletedStores}
                  onRestoreStore={handleRestoreStore}
                />
              </div>

              {/* Map */}
              <div className="p-4 h-[100vh] shrink-0">
                <RouteMap
                  stores={activeStores}
                  summary={result.summary}
                  onDeleteStore={handleDeleteStore}
                />
              </div>

              {/* Store Order */}
              <div className="p-4 pt-0">
                <StoreOrderCard stores={activeStores} className="max-h-[60vh]" />
              </div>
            </div>

            {/* ---- Desktop layout (side-by-side) ---- */}
            <div className="hidden lg:flex h-full">
              {/* Map */}
              <div className="flex-1 p-4 pr-0">
                <RouteMap
                  stores={activeStores}
                  summary={result.summary}
                  onDeleteStore={handleDeleteStore}
                />
              </div>

              {/* Sidebar */}
              <div className="w-[360px] shrink-0 p-4 h-full overflow-hidden flex flex-col gap-4">
                <RouteSummaryCard
                  summary={result.summary}
                  stores={activeStores}
                  deletedStores={deletedStores}
                  onRestoreStore={handleRestoreStore}
                />
                <StoreOrderCard stores={activeStores} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
