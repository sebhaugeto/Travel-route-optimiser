"""Distance matrix computation using the Haversine formula."""

import numpy as np

EARTH_RADIUS_M = 6_371_000  # Earth's mean radius in meters


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute the Haversine distance in meters between two points."""
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


def compute_distance_matrix(coords: list[tuple[float, float]]) -> np.ndarray:
    """
    Compute a pairwise distance matrix from a list of (lat, lng) tuples.

    Returns an NxN numpy array of distances in meters.
    """
    n = len(coords)
    lats = np.array([c[0] for c in coords])
    lngs = np.array([c[1] for c in coords])

    # Vectorised pairwise haversine
    lat1 = np.radians(lats[:, np.newaxis])
    lat2 = np.radians(lats[np.newaxis, :])
    lng1 = np.radians(lngs[:, np.newaxis])
    lng2 = np.radians(lngs[np.newaxis, :])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlng / 2) ** 2
    matrix = 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))

    return matrix
