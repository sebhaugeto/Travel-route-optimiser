const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Store {
  visit_order: number;
  day: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  leg_distance_m: number;
}

export interface RouteSummary {
  total_distance_m: number;
  avg_leg_m: number;
  max_leg_m: number;
  min_leg_m: number;
  num_days: number;
  total_stores: number;
  failed_geocoding: string[];
}

export interface OptimizeResponse {
  stores: Store[];
  summary: RouteSummary;
  csv_download: string;
}

export async function optimizeRoute(
  file: File,
  storesPerDay: number,
  addressColumn?: string
): Promise<OptimizeResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("stores_per_day", storesPerDay.toString());
  if (addressColumn) {
    formData.append("address_column", addressColumn);
  }

  const res = await fetch(`${API_BASE}/optimize`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Server error: ${res.status}`);
  }

  return res.json();
}
