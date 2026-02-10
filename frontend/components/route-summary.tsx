"use client";

import { MapPin, Route, Calendar, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Store, RouteSummary as RouteSummaryType } from "@/lib/api";

// Day colours (same as map)
const DAY_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#059669",
];

function getColor(day: number) {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

function formatDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters.toFixed(0)} m`;
}

interface RouteSummaryProps {
  summary: RouteSummaryType;
  stores: Store[];
}

export function RouteSummaryPanel({ summary, stores }: RouteSummaryProps) {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Stats card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Route className="size-5" />
            Route Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Total distance</p>
              <p className="font-semibold text-base">
                {formatDist(summary.total_distance_m)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Stores</p>
              <p className="font-semibold text-base">{summary.total_stores}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Avg leg</p>
              <p className="font-semibold">{formatDist(summary.avg_leg_m)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Days</p>
              <p className="font-semibold">{summary.num_days}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Shortest leg</p>
              <p className="font-semibold">{formatDist(summary.min_leg_m)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Longest leg</p>
              <p className="font-semibold">{formatDist(summary.max_leg_m)}</p>
            </div>
          </div>

          {summary.failed_geocoding.length > 0 && (
            <>
              <Separator className="my-3" />
              <div>
                <p className="text-xs text-destructive font-medium mb-1">
                  Failed to geocode ({summary.failed_geocoding.length}):
                </p>
                {summary.failed_geocoding.map((addr) => (
                  <p key={addr} className="text-xs text-muted-foreground truncate">
                    {addr}
                  </p>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Store list */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="size-5" />
            Store Order
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="space-y-1">
            {stores.map((store, i) => (
              <div key={store.visit_order}>
                <div className="flex items-start gap-2 py-1.5">
                  <span
                    className="flex items-center justify-center rounded-full text-white text-xs font-bold shrink-0 size-6"
                    style={{ backgroundColor: getColor(store.day) }}
                  >
                    {store.visit_order}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{store.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {store.address}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    Day {store.day}
                  </Badge>
                </div>
                {store.leg_distance_m > 0 && i < stores.length - 1 && (
                  <div className="flex items-center gap-1 ml-8 text-xs text-muted-foreground">
                    <ArrowRight className="size-3" />
                    {formatDist(store.leg_distance_m)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
