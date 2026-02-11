"""FastAPI backend for the Travel Route Optimizer."""

import base64
import io
import json
import math
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from geocoder import geocode_addresses_iter, _geocode_single, _load_cache, _save_cache
from distance import compute_distance_matrix
from solver import solve_tsp

app = FastAPI(title="Travel Route Optimizer")


@app.get("/health")
async def health():
    """Lightweight health check for warm-up pings and monitoring."""
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _detect_address_column(columns: list[str]) -> str:
    """Auto-detect which column contains addresses."""
    candidates = ["address", "addr", "street", "location", "adresse", "adress"]
    lower_cols = {c.lower().strip(): c for c in columns}
    for candidate in candidates:
        if candidate in lower_cols:
            return lower_cols[candidate]
    # Fallback: first column that isn't obviously numeric
    return columns[0]


def _detect_name_column(columns: list[str]) -> Optional[str]:
    """Try to find a store name column."""
    # Exact matches first
    candidates = [
        "name", "store", "store_name", "store name", "shop", "shop_name",
        "shop name", "butik", "navn", "brand", "brand_name", "brand name",
        "company", "company_name", "company name", "merchant", "merchant_name",
    ]
    lower_cols = {c.lower().strip(): c for c in columns}
    for candidate in candidates:
        if candidate in lower_cols:
            return lower_cols[candidate]

    # Substring matches (e.g., "Store Name (DK)" or "Butiksnavn")
    for keyword in ["name", "navn", "store", "butik", "brand", "shop", "merchant"]:
        for col_lower, col_orig in lower_cols.items():
            if keyword in col_lower:
                return col_orig

    return None


def _detect_url_column(columns: list[str]) -> Optional[str]:
    """Try to find a webshop / URL column."""
    candidates = [
        "url", "webshop", "website", "web", "link", "shop_url", "shop_link",
        "webshop_url", "webshop_link", "store_url", "store_link", "homepage",
        "hjemmeside", "webside", "webadresse",
    ]
    lower_cols = {c.lower().strip(): c for c in columns}
    for candidate in candidates:
        if candidate in lower_cols:
            return lower_cols[candidate]

    # Substring matches
    for keyword in ["url", "link", "webshop", "website", "hjemmeside", "web"]:
        for col_lower, col_orig in lower_cols.items():
            if keyword in col_lower:
                return col_orig

    return None


def _detect_revenue_column(df: pd.DataFrame) -> Optional[str]:
    """
    Try to find a revenue / GMV column by name and data type.

    Checks column names against common revenue-related keywords, then verifies
    the column contains numeric data.
    """
    candidates = [
        "gmv", "revenue", "annual_gmv", "annual_revenue", "annual gmv",
        "annual revenue", "yearly_revenue", "yearly_gmv", "sales", "turnover",
        "omsætning", "omsaetning", "income", "total_revenue", "total_gmv",
        "total_sales", "rev", "annual_sales",
    ]
    lower_cols = {c.lower().strip(): c for c in df.columns}

    for candidate in candidates:
        if candidate in lower_cols:
            col = lower_cols[candidate]
            # Verify it contains numeric-ish data
            try:
                vals = pd.to_numeric(
                    df[col].astype(str).str.replace(r"[^\d.\-]", "", regex=True),
                    errors="coerce",
                )
                if vals.notna().sum() > 0:
                    return col
            except Exception:
                continue

    # Fallback: check for any column whose name contains these keywords
    for keyword in ["gmv", "revenue", "sales", "turnover"]:
        for col_lower, col_orig in lower_cols.items():
            if keyword in col_lower:
                try:
                    vals = pd.to_numeric(
                        df[col_orig].astype(str).str.replace(r"[^\d.\-]", "", regex=True),
                        errors="coerce",
                    )
                    if vals.notna().sum() > 0:
                        return col_orig
                except Exception:
                    continue

    return None


def _parse_revenue_values(df: pd.DataFrame, col: str) -> list[float]:
    """Parse a revenue column into a list of floats, filling NaN with 0."""
    cleaned = df[col].astype(str).str.replace(r"[^\d.\-]", "", regex=True)
    vals = pd.to_numeric(cleaned, errors="coerce").fillna(0.0)
    return vals.tolist()


def _parse_csv(contents: bytes) -> pd.DataFrame:
    """Parse CSV bytes, trying common encodings and auto-detecting delimiter."""
    decoded = None
    for encoding in ["utf-8", "latin-1", "cp1252"]:
        try:
            decoded = contents.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if decoded is None:
        raise ValueError("Could not decode CSV file.")

    return pd.read_csv(
        io.StringIO(decoded),
        sep=None,
        engine="python",
        on_bad_lines="warn",
    )


@app.post("/optimize")
async def optimize_route(
    file: UploadFile = File(...),
    stores_per_day: int = Form(default=20),
    address_column: Optional[str] = Form(default=None),
    prioritize_revenue: bool = Form(default=False),
    journey_mode: str = Form(default="continue"),  # "continue", "same_start", "round_trip"
    start_address: Optional[str] = Form(default=None),
):
    """
    Accept a CSV, geocode, solve TSP, and stream NDJSON progress + result.

    Stream format (one JSON object per line):
      {"type":"progress","current":3,"total":120,"address":"...","stage":"geocoding"}
      {"type":"progress","current":120,"total":120,"address":"...","stage":"solving"}
      {"type":"result","data":{...}}       <-- final line, same shape as before
      {"type":"error","detail":"..."}      <-- only on failure
    """
    # --- 1. Parse CSV (before streaming so we can return 400 on bad input) ---
    try:
        contents = await file.read()
        df = _parse_csv(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    # --- 2. Identify columns ---
    if address_column and address_column in df.columns:
        addr_col = address_column
    else:
        addr_col = _detect_address_column(list(df.columns))

    if addr_col not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Address column '{addr_col}' not found. Columns: {list(df.columns)}",
        )

    name_col = _detect_name_column(list(df.columns))
    url_col = _detect_url_column(list(df.columns))

    # --- Revenue column (always detected for display; required when prioritizing) ---
    revenue_col = _detect_revenue_column(df)
    all_revenues: list[float] = []
    if revenue_col is not None:
        all_revenues = _parse_revenue_values(df, revenue_col)
    if prioritize_revenue and revenue_col is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Revenue prioritization is enabled but no revenue column was found. "
                "Make sure your CSV has a column named something like 'GMV', 'Revenue', "
                "'Sales', or 'Turnover' with numeric values."
            ),
        )

    # --- Validate journey mode and start address ---
    if journey_mode not in ("continue", "same_start", "round_trip"):
        raise HTTPException(status_code=400, detail=f"Invalid journey_mode: {journey_mode}")

    needs_base = journey_mode in ("same_start", "round_trip")
    if needs_base and not start_address:
        raise HTTPException(
            status_code=400,
            detail="A start address is required for the selected journey mode.",
        )

    has_coords = "lat" in [c.lower() for c in df.columns] and "lng" in [
        c.lower() for c in df.columns
    ]

    addresses = df[addr_col].astype(str).tolist()

    # --- Generator that yields NDJSON lines ---
    def _stream():
        # --- 3a. Geocode the base address if needed ---
        base_coords = None
        if needs_base and start_address:
            cache = _load_cache()
            base_result = _geocode_single(start_address, ", Copenhagen, Denmark", cache)
            _save_cache(cache)
            if base_result["status"] != "ok":
                yield json.dumps({
                    "type": "error",
                    "detail": f"Could not geocode start address: {start_address}",
                }) + "\n"
                return
            base_coords = (base_result["lat"], base_result["lng"])

        # --- 3b. Geocode store addresses (streaming progress) ---
        if has_coords:
            lat_col = [c for c in df.columns if c.lower() == "lat"][0]
            lng_col = [c for c in df.columns if c.lower() == "lng"][0]
            geocoded = []
            for idx, (_, row) in enumerate(df.iterrows()):
                geocoded.append(
                    {
                        "address": str(row[addr_col]),
                        "lat": float(row[lat_col]),
                        "lng": float(row[lng_col]),
                        "status": "ok",
                    }
                )
                yield json.dumps({
                    "type": "progress",
                    "current": idx + 1,
                    "total": len(df),
                    "address": str(row[addr_col]),
                    "stage": "geocoding",
                }) + "\n"
        else:
            geocoded = []
            for item in geocode_addresses_iter(addresses):
                geocoded.append({
                    "address": item["address"],
                    "lat": item["lat"],
                    "lng": item["lng"],
                    "status": item["status"],
                })
                yield json.dumps({
                    "type": "progress",
                    "current": item["index"] + 1,
                    "total": item["total"],
                    "address": item["address"],
                    "stage": "geocoding",
                }) + "\n"

        # --- 4. Filter ---
        valid_indices = [i for i, g in enumerate(geocoded) if g["status"] == "ok"]
        failed = [geocoded[i]["address"] for i in range(len(geocoded)) if i not in valid_indices]

        if len(valid_indices) < 2:
            yield json.dumps({
                "type": "error",
                "detail": f"Need at least 2 geocoded stores. Failed: {failed}",
            }) + "\n"
            return

        coords = [(geocoded[i]["lat"], geocoded[i]["lng"]) for i in valid_indices]

        # --- 5. Distance matrix + solve ---
        yield json.dumps({
            "type": "progress",
            "current": 0,
            "total": 1,
            "address": "",
            "stage": "routing",
        }) + "\n"

        # If we have a base location, append it as an extra node
        depot_idx = None
        if base_coords is not None:
            coords.append(base_coords)
            depot_idx = len(coords) - 1  # last index

        dist_matrix = compute_distance_matrix(coords)

        yield json.dumps({
            "type": "progress",
            "current": 0,
            "total": 1,
            "address": "",
            "stage": "solving",
        }) + "\n"

        # Build revenue list for valid (geocoded) stores only
        valid_revenues = None
        if prioritize_revenue and all_revenues:
            valid_revenues = [all_revenues[i] for i in valid_indices]
            # Pad with 0 for the base node so arrays align
            if depot_idx is not None:
                valid_revenues.append(0.0)

        is_closed = journey_mode == "round_trip"

        route_order = solve_tsp(
            dist_matrix,
            time_limit_seconds=30,
            revenues=valid_revenues,
            depot_idx=depot_idx,
            closed=is_closed,
        )

        # Remove base node from the route (it's the depot, not a store)
        store_route = [idx for idx in route_order if idx != depot_idx]

        # --- 6. Build response ---
        stores_response = []
        for rank, node_idx in enumerate(store_route):
            original_idx = valid_indices[node_idx]
            g = geocoded[original_idx]

            if rank < len(store_route) - 1:
                next_node = store_route[rank + 1]
                leg_dist = float(dist_matrix[node_idx][next_node])
            else:
                leg_dist = 0.0

            store_data = {
                "visit_order": rank + 1,
                "day": (rank // stores_per_day) + 1,
                "address": g["address"],
                "lat": g["lat"],
                "lng": g["lng"],
                "leg_distance_m": round(leg_dist, 1),
            }

            if name_col and name_col in df.columns:
                store_data["name"] = str(df.iloc[original_idx][name_col])
            else:
                store_data["name"] = f"Store {rank + 1}"

            if url_col and url_col in df.columns:
                raw_url = str(df.iloc[original_idx][url_col]).strip()
                if raw_url and raw_url.lower() not in ("nan", "none", ""):
                    store_data["url"] = raw_url
                else:
                    store_data["url"] = None
            else:
                store_data["url"] = None

            if all_revenues:
                store_data["revenue"] = all_revenues[original_idx]
            else:
                store_data["revenue"] = None

            stores_response.append(store_data)

        # Calculate leg distances for summary
        leg_distances = [s["leg_distance_m"] for s in stores_response if s["leg_distance_m"] > 0]

        # For same_start or round_trip, add commute distances to/from base
        base_commute_note = None
        if base_coords is not None and len(store_route) > 0:
            first_store_node = store_route[0]
            last_store_node = store_route[-1]
            commute_to_first = float(dist_matrix[depot_idx][first_store_node])
            commute_from_last = float(dist_matrix[last_store_node][depot_idx])

            if journey_mode == "round_trip":
                base_commute_note = {
                    "commute_to_first_m": round(commute_to_first, 1),
                    "commute_from_last_m": round(commute_from_last, 1),
                }
            elif journey_mode == "same_start":
                base_commute_note = {
                    "commute_to_first_m": round(commute_to_first, 1),
                }

        total_dist = sum(leg_distances)
        avg_leg = total_dist / len(leg_distances) if leg_distances else 0
        max_leg = max(leg_distances) if leg_distances else 0
        min_leg = min(leg_distances) if leg_distances else 0
        num_days = math.ceil(len(stores_response) / stores_per_day)

        summary = {
            "total_distance_m": round(total_dist, 1),
            "avg_leg_m": round(avg_leg, 1),
            "max_leg_m": round(max_leg, 1),
            "min_leg_m": round(min_leg, 1),
            "num_days": num_days,
            "total_stores": len(stores_response),
            "failed_geocoding": failed,
            "journey_mode": journey_mode,
        }

        if base_commute_note:
            summary["base_commute"] = base_commute_note
        if start_address and needs_base:
            summary["start_address"] = start_address
        if base_coords:
            summary["start_lat"] = base_coords[0]
            summary["start_lng"] = base_coords[1]

        out_df = pd.DataFrame(stores_response)
        csv_buffer = io.StringIO()
        out_df.to_csv(csv_buffer, index=False)
        csv_b64 = base64.b64encode(csv_buffer.getvalue().encode("utf-8")).decode("utf-8")

        yield json.dumps({
            "type": "result",
            "data": {
                "stores": stores_response,
                "summary": summary,
                "csv_download": csv_b64,
            },
        }) + "\n"

    return StreamingResponse(_stream(), media_type="application/x-ndjson")


@app.get("/health")
async def health():
    return {"status": "ok"}
