"""
Distance matrix computation.

Primary:  OSRM public server (real road-network distances).
Fallback: Haversine (straight-line) if OSRM is unavailable.

OSRM uses the 'driving' profile on the public demo server.  In a dense
urban area like Copenhagen, driving road distances are an excellent proxy
for cycling distances (same streets, only speeds differ).
"""

import logging
from typing import Optional

import numpy as np
import requests

logger = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_000
OSRM_TABLE_URL = "http://router.project-osrm.org/table/v1/driving"
OSRM_MAX_COORDS = 100  # demo server hard limit per request
CHUNK_SIZE = 50  # ensures any two chunks combined ≤ OSRM_MAX_COORDS


# ---------------------------------------------------------------------------
# Haversine (fallback)
# ---------------------------------------------------------------------------

def _haversine_matrix(coords: list[tuple[float, float]]) -> np.ndarray:
    """Vectorised pairwise Haversine distance matrix (meters)."""
    lats = np.array([c[0] for c in coords])
    lngs = np.array([c[1] for c in coords])

    lat1 = np.radians(lats[:, np.newaxis])
    lat2 = np.radians(lats[np.newaxis, :])
    lng1 = np.radians(lngs[:, np.newaxis])
    lng2 = np.radians(lngs[np.newaxis, :])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


# ---------------------------------------------------------------------------
# OSRM table API helpers
# ---------------------------------------------------------------------------

def _osrm_table_request(
    coords: list[tuple[float, float]],
    sources: list[int],
    destinations: list[int],
) -> Optional[list[list[float]]]:
    """
    Call the OSRM table endpoint for a subset of sources/destinations.

    coords:       Full list of (lat, lng) tuples included in this request.
    sources:      Indices (into `coords`) to use as row origins.
    destinations: Indices (into `coords`) to use as column destinations.

    Returns a len(sources) × len(destinations) nested list of distances
    in meters, or None on failure.
    """
    # OSRM expects lng,lat (not lat,lng)
    coord_str = ";".join(f"{lng},{lat}" for lat, lng in coords)
    src_str = ";".join(str(i) for i in sources)
    dst_str = ";".join(str(i) for i in destinations)

    # Build URL -- omit sources/destinations when they cover all coords (shorter URL)
    all_sources = sources == list(range(len(coords)))
    all_dests = destinations == list(range(len(coords)))

    params = "annotations=distance"
    if not all_sources:
        params += f"&sources={src_str}"
    if not all_dests:
        params += f"&destinations={dst_str}"

    url = f"{OSRM_TABLE_URL}/{coord_str}?{params}"

    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "Ok":
            logger.warning("OSRM returned code=%s", data.get("code"))
            return None
        return data["distances"]
    except Exception as e:
        logger.warning("OSRM request failed: %s", e)
        return None


def _osrm_full_matrix(coords: list[tuple[float, float]]) -> Optional[np.ndarray]:
    """
    Build a full N×N road-distance matrix via the OSRM table API.

    For N ≤ OSRM_MAX_COORDS a single request suffices.
    For larger N, the coordinates are split into chunks and the matrix is
    assembled from sub-requests (each ≤ OSRM_MAX_COORDS coordinates).
    """
    n = len(coords)

    if n <= OSRM_MAX_COORDS:
        # --- Single request ---
        sources = list(range(n))
        destinations = list(range(n))
        distances = _osrm_table_request(coords, sources, destinations)
        if distances is None:
            return None
        matrix = np.array(distances, dtype=np.float64)
        # OSRM returns null for unreachable pairs; replace with a large value
        matrix = np.where(np.isnan(matrix) | (matrix < 0), 1e9, matrix)
        return matrix

    # --- Batched requests for large coordinate sets ---
    # Each chunk ≤ 50, so any cross-pair ≤ 100 (within OSRM limit).
    chunks = [list(range(i, min(i + CHUNK_SIZE, n))) for i in range(0, n, CHUNK_SIZE)]
    num_requests = len(chunks) ** 2
    logger.info("Batching into %d OSRM requests (%d chunks of ≤%d)...", num_requests, len(chunks), CHUNK_SIZE)

    matrix = np.zeros((n, n), dtype=np.float64)

    for src_chunk in chunks:
        for dst_chunk in chunks:
            combined_indices = list(dict.fromkeys(src_chunk + dst_chunk))
            global_to_local = {g: l for l, g in enumerate(combined_indices)}

            sub_coords = [coords[i] for i in combined_indices]
            local_sources = [global_to_local[i] for i in src_chunk]
            local_dests = [global_to_local[i] for i in dst_chunk]

            distances = _osrm_table_request(sub_coords, local_sources, local_dests)
            if distances is None:
                return None

            for r, src_global in enumerate(src_chunk):
                for c, dst_global in enumerate(dst_chunk):
                    val = distances[r][c]
                    matrix[src_global][dst_global] = val if val is not None and val >= 0 else 1e9

    return matrix


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_distance_matrix(
    coords: list[tuple[float, float]],
    use_roads: bool = True,
) -> np.ndarray:
    """
    Compute a pairwise distance matrix from (lat, lng) tuples.

    Args:
        coords:    List of (latitude, longitude) tuples.
        use_roads: If True, try OSRM road distances first (fallback: Haversine).

    Returns:
        N×N numpy array of distances in meters.
    """
    if use_roads:
        logger.info("Computing road-distance matrix via OSRM for %d locations...", len(coords))
        matrix = _osrm_full_matrix(coords)
        if matrix is not None:
            logger.info("OSRM road-distance matrix ready.")
            return matrix
        logger.warning("OSRM failed — falling back to Haversine straight-line distances.")

    return _haversine_matrix(coords)
