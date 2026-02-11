const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Ping the backend health endpoint.
 * Resolves when the server is ready, retries on failure.
 */
export async function waitForBackend(
  onAttempt?: (attempt: number) => void,
  maxAttempts = 20,
  intervalMs = 3000,
): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    onAttempt?.(i);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    if (i < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  // Give up after max attempts — let the user proceed anyway
}

export interface Store {
  visit_order: number;
  day: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  leg_distance_m: number;
  url: string | null;
  revenue: number | null;
}

export type JourneyMode = "continue" | "same_start" | "round_trip";

export interface BaseCommute {
  commute_to_first_m: number;
  commute_from_last_m?: number;
}

export interface RouteSummary {
  total_distance_m: number;
  avg_leg_m: number;
  max_leg_m: number;
  min_leg_m: number;
  num_days: number;
  total_stores: number;
  failed_geocoding: string[];
  journey_mode?: JourneyMode;
  base_commute?: BaseCommute;
  start_address?: string;
  start_lat?: number;
  start_lng?: number;
}

export interface OptimizeResponse {
  stores: Store[];
  summary: RouteSummary;
  csv_download: string;
}

export interface ProgressEvent {
  current: number;
  total: number;
  address: string;
  stage: "geocoding" | "routing" | "solving";
}

export async function optimizeRoute(
  file: File,
  storesPerDay: number,
  onProgress?: (progress: ProgressEvent) => void,
  options?: {
    addressColumn?: string;
    prioritizeRevenue?: boolean;
    journeyMode?: JourneyMode;
    startAddress?: string;
  },
): Promise<OptimizeResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("stores_per_day", storesPerDay.toString());
  if (options?.addressColumn) {
    formData.append("address_column", options.addressColumn);
  }
  if (options?.prioritizeRevenue) {
    formData.append("prioritize_revenue", "true");
  }
  if (options?.journeyMode) {
    formData.append("journey_mode", options.journeyMode);
  }
  if (options?.startAddress) {
    formData.append("start_address", options.startAddress);
  }

  const res = await fetch(`${API_BASE}/optimize`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Server error: ${res.status}`);
  }

  // Read NDJSON stream line by line
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Streaming not supported by browser");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: OptimizeResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);

        if (event.type === "progress" && onProgress) {
          onProgress({
            current: event.current,
            total: event.total,
            address: event.address,
            stage: event.stage,
          });
        } else if (event.type === "result") {
          result = event.data as OptimizeResponse;
        } else if (event.type === "error") {
          throw new Error(event.detail);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // skip malformed lines
        throw e;
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      if (event.type === "result") {
        result = event.data as OptimizeResponse;
      } else if (event.type === "error") {
        throw new Error(event.detail);
      }
    } catch {
      // ignore
    }
  }

  if (!result) {
    throw new Error("No result received from server");
  }

  return result;
}
