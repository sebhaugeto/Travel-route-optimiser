"""FastAPI backend for the Travel Route Optimizer."""

import base64
import io
import math
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from geocoder import geocode_addresses
from distance import compute_distance_matrix
from solver import solve_tsp

app = FastAPI(title="Travel Route Optimizer")

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
    candidates = ["name", "store", "store_name", "shop", "butik", "navn"]
    lower_cols = {c.lower().strip(): c for c in columns}
    for candidate in candidates:
        if candidate in lower_cols:
            return lower_cols[candidate]
    return None


@app.post("/optimize")
async def optimize_route(
    file: UploadFile = File(...),
    stores_per_day: int = Form(default=20),
    address_column: Optional[str] = Form(default=None),
):
    """
    Accept a CSV with store addresses, geocode them, solve the TSP,
    and return the optimized route as JSON + a downloadable CSV.
    """
    # --- 1. Parse CSV ---
    try:
        contents = await file.read()
        # Try common encodings
        for encoding in ["utf-8", "latin-1", "cp1252"]:
            try:
                df = pd.read_csv(io.BytesIO(contents), encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(status_code=400, detail="Could not decode CSV file.")
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

    # Check if lat/lng columns already exist (user override)
    has_coords = "lat" in [c.lower() for c in df.columns] and "lng" in [
        c.lower() for c in df.columns
    ]

    addresses = df[addr_col].astype(str).tolist()

    # --- 3. Geocode ---
    if has_coords:
        lat_col = [c for c in df.columns if c.lower() == "lat"][0]
        lng_col = [c for c in df.columns if c.lower() == "lng"][0]
        geocoded = []
        for _, row in df.iterrows():
            geocoded.append(
                {
                    "address": str(row[addr_col]),
                    "lat": float(row[lat_col]),
                    "lng": float(row[lng_col]),
                    "status": "ok",
                }
            )
    else:
        geocoded = geocode_addresses(addresses)

    # Filter to successfully geocoded stores
    valid_indices = [i for i, g in enumerate(geocoded) if g["status"] == "ok"]
    failed = [geocoded[i]["address"] for i in range(len(geocoded)) if i not in valid_indices]

    if len(valid_indices) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 2 geocoded stores. Failed: {failed}",
        )

    coords = [(geocoded[i]["lat"], geocoded[i]["lng"]) for i in valid_indices]

    # --- 4. Distance matrix ---
    dist_matrix = compute_distance_matrix(coords)

    # --- 5. Solve TSP ---
    route_order = solve_tsp(dist_matrix, time_limit_seconds=30)

    # --- 6. Build response ---
    stores_response = []
    for rank, node_idx in enumerate(route_order):
        original_idx = valid_indices[node_idx]
        g = geocoded[original_idx]

        # Compute leg distance to next store
        if rank < len(route_order) - 1:
            next_node = route_order[rank + 1]
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

        stores_response.append(store_data)

    # Compute summary
    leg_distances = [s["leg_distance_m"] for s in stores_response if s["leg_distance_m"] > 0]
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
    }

    # Build CSV for download
    out_df = pd.DataFrame(stores_response)
    csv_buffer = io.StringIO()
    out_df.to_csv(csv_buffer, index=False)
    csv_b64 = base64.b64encode(csv_buffer.getvalue().encode("utf-8")).decode("utf-8")

    return {
        "stores": stores_response,
        "summary": summary,
        "csv_download": csv_b64,
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
