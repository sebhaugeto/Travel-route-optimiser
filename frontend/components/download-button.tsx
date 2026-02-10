"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/api";

interface DownloadButtonProps {
  stores: Store[];
  disabled: boolean;
}

function storesToCsv(stores: Store[]): string {
  const headers = [
    "visit_order",
    "day",
    "day_position",
    "name",
    "address",
    "lat",
    "lng",
    "leg_distance_m",
    "url",
    "revenue",
  ];

  const escape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  // Compute each store's position within its day (1-based)
  const dayCounters = new Map<number, number>();
  const dayPositions: number[] = [];
  for (const s of stores) {
    const pos = (dayCounters.get(s.day) ?? 0) + 1;
    dayCounters.set(s.day, pos);
    dayPositions.push(pos);
  }

  const rows = stores.map((s, i) =>
    [
      s.visit_order,
      s.day,
      dayPositions[i],
      escape(s.name),
      escape(s.address),
      s.lat,
      s.lng,
      s.leg_distance_m,
      s.url ? escape(s.url) : "",
      s.revenue != null ? s.revenue : "",
    ].join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export function DownloadButton({ stores, disabled }: DownloadButtonProps) {
  const handleDownload = () => {
    if (stores.length === 0) return;

    const csv = storesToCsv(stores);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "optimized_route.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={handleDownload}
      className="gap-2"
    >
      <Download className="size-4" />
      Download CSV
    </Button>
  );
}
