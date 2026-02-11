"use client";

import { MapPin, Route, ArrowRight, ChevronRight, ExternalLink, Euro, Home, Trash2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

function formatRevenue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

// ---------- Route Summary Card (stats, base location, deleted stores, failed geocoding) ----------

interface RouteSummaryCardProps {
  summary: RouteSummaryType;
  stores: Store[];
  deletedStores?: Store[];
  onRestoreStore?: (visitOrder: number) => void;
}

export function RouteSummaryCard({ summary, stores, deletedStores = [], onRestoreStore }: RouteSummaryCardProps) {
  const totalGmv = stores.reduce((sum, s) => sum + (s.revenue ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Route className="size-5" />
          Route Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {totalGmv > 0 && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Total GMV</p>
              <p className="font-semibold text-base">
                &euro;{formatRevenue(totalGmv)}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Total distance</p>
            <p className="font-semibold text-base">
              {formatDist(summary.total_distance_m)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Stores</p>
            <p className="font-semibold text-base">
              {stores.length}
              {deletedStores.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  / {stores.length + deletedStores.length}
                </span>
              )}
            </p>
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

        {summary.start_address && (
          <>
            <Separator className="my-3" />
            <div className="flex items-start gap-2 text-sm">
              <Home className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-muted-foreground">Base location</p>
                <p className="font-medium text-xs">{summary.start_address}</p>
                {summary.journey_mode === "round_trip" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Start &amp; return each day
                  </p>
                )}
                {summary.journey_mode === "same_start" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Start from base each day
                  </p>
                )}
                {summary.base_commute && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <p>Commute to first store: {formatDist(summary.base_commute.commute_to_first_m)}</p>
                    {summary.base_commute.commute_from_last_m != null && (
                      <p>Return from last store: {formatDist(summary.base_commute.commute_from_last_m)}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Deleted stores */}
        {deletedStores.length > 0 && (
          <>
            <Separator className="my-3" />
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium group cursor-pointer text-orange-600">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                <Trash2 className="size-3" />
                Removed stores ({deletedStores.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1.5 space-y-1">
                  {deletedStores.map((store) => (
                    <div
                      key={store.visit_order}
                      className="flex items-center gap-2 pl-4 py-1 group/item"
                    >
                      <span
                        className="flex items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0 size-5 opacity-50"
                        style={{ backgroundColor: getColor(store.day) }}
                      >
                        {store.visit_order}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          {store.name}
                        </p>
                      </div>
                      {onRestoreStore && (
                        <button
                          onClick={() => onRestoreStore(store.visit_order)}
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Restore to route"
                        >
                          <Undo2 className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {summary.failed_geocoding.length > 0 && (
          <>
            <Separator className="my-3" />
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-destructive font-medium group cursor-pointer">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                Failed to geocode ({summary.failed_geocoding.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 space-y-0.5">
                  {summary.failed_geocoding.map((addr) => (
                    <p key={addr} className="text-xs text-muted-foreground truncate pl-4">
                      {addr}
                    </p>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Store Order Card (scrollable store list) ----------

interface StoreOrderCardProps {
  stores: Store[];
  className?: string;
}

export function StoreOrderCard({ stores, className = "" }: StoreOrderCardProps) {
  return (
    <Card className={`flex-1 overflow-hidden flex flex-col ${className}`}>
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
                  {store.url && (
                    <a
                      href={store.url.startsWith("http") ? store.url : `https://${store.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{store.url.replace(/^https?:\/\//, "")}</span>
                    </a>
                  )}
                  {store.revenue != null && store.revenue > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Euro className="size-3 shrink-0" />
                      {formatRevenue(store.revenue)} GMV
                    </span>
                  )}
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
  );
}

// ---------- Combined panel (used on desktop sidebar) ----------

interface RouteSummaryPanelProps {
  summary: RouteSummaryType;
  stores: Store[];
  deletedStores?: Store[];
  onRestoreStore?: (visitOrder: number) => void;
}

export function RouteSummaryPanel({ summary, stores, deletedStores = [], onRestoreStore }: RouteSummaryPanelProps) {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <RouteSummaryCard
        summary={summary}
        stores={stores}
        deletedStores={deletedStores}
        onRestoreStore={onRestoreStore}
      />
      <StoreOrderCard stores={stores} />
    </div>
  );
}
