"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Store, RouteSummary } from "@/lib/api";

// Day colours palette (up to 10 days)
const DAY_COLORS = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#d97706", // amber
  "#7c3aed", // violet
  "#db2777", // pink
  "#0891b2", // cyan
  "#ea580c", // orange
  "#4f46e5", // indigo
  "#059669", // emerald
];

function getColor(day: number) {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

/** Home/base icon -- a simple SVG house marker */
const BASE_ICON = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#111827;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Auto-fit the map bounds to the stores (and base if present) */
function FitBounds({ stores, baseLat, baseLng }: { stores: Store[]; baseLat?: number; baseLng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (stores.length === 0) return;
    const bounds: [number, number][] = stores.map((s) => [s.lat, s.lng]);
    if (baseLat != null && baseLng != null) {
      bounds.push([baseLat, baseLng]);
    }
    map.fitBounds(bounds, { padding: [40, 40] });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only fit on first render
  }, []);
  return null;
}

/** Small wrapper so the delete button can close the popup after clicking */
function StorePopupContent({
  store,
  onDelete,
}: {
  store: Store;
  onDelete: (visitOrder: number) => void;
}) {
  const popupElRef = useRef<HTMLDivElement>(null);

  const handleRemove = () => {
    // Close the popup before deleting so Leaflet doesn't error
    const popup = popupElRef.current?.closest(".leaflet-popup");
    if (popup) {
      const closeBtn = popup.querySelector(".leaflet-popup-close-button") as HTMLElement | null;
      closeBtn?.click();
    }
    // Small delay so Leaflet can finish closing the popup
    setTimeout(() => onDelete(store.visit_order), 50);
  };

  return (
    <div ref={popupElRef} style={{ fontSize: "12px", lineHeight: "1.5", minWidth: "140px" }}>
      <strong>#{store.visit_order}</strong> {store.name}
      {store.url && (
        <>
          <br />
          <a
            href={store.url.startsWith("http") ? store.url : `https://${store.url}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#2563eb", textDecoration: "underline" }}
          >
            {store.url.replace(/^https?:\/\//, "")}
          </a>
        </>
      )}
      {store.revenue != null && store.revenue > 0 && (
        <>
          <br />
          <span style={{ color: "#666" }}>
            GMV: &euro;{store.revenue >= 1000000
              ? `${(store.revenue / 1000000).toFixed(1)}M`
              : store.revenue >= 1000
                ? `${(store.revenue / 1000).toFixed(0)}K`
                : store.revenue.toFixed(0)}
          </span>
        </>
      )}
      <br />
      {store.address}
      <br />
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#2563eb", textDecoration: "underline" }}
      >
        Open in Google Maps
      </a>
      <br />
      Day {store.day}
      {store.leg_distance_m > 0 && (
        <>
          <br />
          Next: {store.leg_distance_m.toFixed(0)}m
        </>
      )}
      <div style={{ marginTop: "6px", borderTop: "1px solid #e5e7eb", paddingTop: "6px" }}>
        <button
          onClick={handleRemove}
          style={{
            width: "100%",
            padding: "3px 8px",
            fontSize: "11px",
            fontWeight: 500,
            color: "#dc2626",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Remove from route
        </button>
      </div>
    </div>
  );
}

interface RouteMapProps {
  stores: Store[];
  summary?: RouteSummary;
  onDeleteStore?: (visitOrder: number) => void;
}

export default function RouteMap({ stores, summary, onDeleteStore }: RouteMapProps) {
  // Group stores by day for colored polyline segments
  const daySegments = useMemo(() => {
    const days = new Map<number, Store[]>();
    for (const s of stores) {
      if (!days.has(s.day)) days.set(s.day, []);
      days.get(s.day)!.push(s);
    }
    return Array.from(days.entries()).map(([day, dayStores]) => ({
      day,
      positions: dayStores.map((s) => [s.lat, s.lng] as [number, number]),
      color: getColor(day),
    }));
  }, [stores]);

  // Base location
  const baseLat = summary?.start_lat;
  const baseLng = summary?.start_lng;
  const hasBase = baseLat != null && baseLng != null;
  const journeyMode = summary?.journey_mode;

  // Connect last store of one day to first store of next day
  // For same_start / round_trip, connect through the base instead
  const bridgeSegments = useMemo(() => {
    const sorted = [...daySegments].sort((a, b) => a.day - b.day);
    const bridges: { positions: [number, number][]; color: string }[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (curr.positions.length > 0 && next.positions.length > 0) {
        if (hasBase && journeyMode === "round_trip") {
          bridges.push({
            positions: [curr.positions[curr.positions.length - 1], [baseLat, baseLng]],
            color: getColor(curr.day),
          });
          bridges.push({
            positions: [[baseLat, baseLng], next.positions[0]],
            color: getColor(next.day),
          });
        } else if (hasBase && journeyMode === "same_start") {
          bridges.push({
            positions: [[baseLat, baseLng], next.positions[0]],
            color: getColor(next.day),
          });
        } else {
          bridges.push({
            positions: [curr.positions[curr.positions.length - 1], next.positions[0]],
            color: getColor(next.day),
          });
        }
      }
    }

    // Also draw first day commute from base and last day return to base
    if (hasBase && sorted.length > 0) {
      const firstDay = sorted[0];
      if (firstDay.positions.length > 0) {
        bridges.push({
          positions: [[baseLat, baseLng], firstDay.positions[0]],
          color: getColor(firstDay.day),
        });
      }
      if (journeyMode === "round_trip") {
        const lastDay = sorted[sorted.length - 1];
        if (lastDay.positions.length > 0) {
          bridges.push({
            positions: [lastDay.positions[lastDay.positions.length - 1], [baseLat, baseLng]],
            color: getColor(lastDay.day),
          });
        }
      }
    }

    return bridges;
  }, [daySegments, hasBase, baseLat, baseLng, journeyMode]);

  // Copenhagen center as default
  const center: [number, number] = [55.676, 12.568];

  return (
    <MapContainer
      center={center}
      zoom={14}
      className="h-full w-full rounded-lg"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds stores={stores} baseLat={baseLat} baseLng={baseLng} />

      {/* Base location marker */}
      {hasBase && (
        <Marker position={[baseLat, baseLng]} icon={BASE_ICON}>
          <Tooltip direction="top" offset={[0, -14]} permanent={false}>
            <div className="text-xs">
              <strong>Base</strong>
              <br />
              {summary?.start_address ?? "Start location"}
            </div>
          </Tooltip>
        </Marker>
      )}

      {/* Day-colored route polylines */}
      {daySegments.map((seg) => (
        <Polyline
          key={`day-${seg.day}`}
          positions={seg.positions}
          color={seg.color}
          weight={3}
          opacity={0.8}
        />
      ))}

      {/* Bridge segments between days (dashed) */}
      {bridgeSegments.map((seg, i) => (
        <Polyline
          key={`bridge-${i}`}
          positions={seg.positions}
          color={seg.color}
          weight={2}
          opacity={0.5}
          dashArray="6 6"
        />
      ))}

      {/* Numbered store markers */}
      {stores.map((store) => (
        <CircleMarker
          key={store.visit_order}
          center={[store.lat, store.lng]}
          radius={10}
          fillColor={getColor(store.day)}
          fillOpacity={0.9}
          color="#fff"
          weight={2}
        >
          <Popup offset={[0, -6]} closeButton={false}>
            <StorePopupContent
              store={store}
              onDelete={onDeleteStore ?? (() => {})}
            />
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
