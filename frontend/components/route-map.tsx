"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Store } from "@/lib/api";

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

/** Auto-fit the map bounds to the stores */
function FitBounds({ stores }: { stores: Store[] }) {
  const map = useMap();
  useEffect(() => {
    if (stores.length === 0) return;
    const bounds = stores.map((s) => [s.lat, s.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [stores, map]);
  return null;
}

interface RouteMapProps {
  stores: Store[];
}

export default function RouteMap({ stores }: RouteMapProps) {
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

  // Connect last store of one day to first store of next day
  const bridgeSegments = useMemo(() => {
    const sorted = [...daySegments].sort((a, b) => a.day - b.day);
    const bridges: { positions: [number, number][]; color: string }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (curr.positions.length > 0 && next.positions.length > 0) {
        bridges.push({
          positions: [
            curr.positions[curr.positions.length - 1],
            next.positions[0],
          ],
          color: getColor(next.day),
        });
      }
    }
    return bridges;
  }, [daySegments]);

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
      <FitBounds stores={stores} />

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
          <Tooltip direction="top" offset={[0, -10]} permanent={false}>
            <div className="text-xs">
              <strong>#{store.visit_order}</strong> {store.name}
              <br />
              {store.address}
              <br />
              Day {store.day}
              {store.leg_distance_m > 0 && (
                <>
                  <br />
                  Next: {store.leg_distance_m.toFixed(0)}m
                </>
              )}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
