"""Geocoder module: converts street addresses to lat/lng coordinates using Nominatim."""

import json
import os
import time
from typing import Optional

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError


CACHE_FILE = os.path.join(os.path.dirname(__file__), "geocode_cache.json")


def _load_cache() -> dict:
    """Load the geocoding cache from disk."""
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_cache(cache: dict) -> None:
    """Persist the geocoding cache to disk."""
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def geocode_addresses(
    addresses: list[str],
    city_suffix: str = ", Copenhagen, Denmark",
    progress_callback: Optional[callable] = None,
) -> list[dict]:
    """
    Geocode a list of street addresses.

    Returns a list of dicts with keys: address, lat, lng, status.
    status is 'ok' or 'failed'.
    """
    geolocator = Nominatim(user_agent="travel-route-optimiser/1.0", timeout=10)
    cache = _load_cache()
    results = []

    for i, raw_address in enumerate(addresses):
        query = raw_address.strip() + city_suffix

        # Check cache first
        if query in cache:
            results.append(
                {
                    "address": raw_address,
                    "lat": cache[query]["lat"],
                    "lng": cache[query]["lng"],
                    "status": "ok",
                }
            )
            if progress_callback:
                progress_callback(i + 1, len(addresses), raw_address, cached=True)
            continue

        # Query Nominatim (rate-limited to 1 req/sec)
        try:
            location = geolocator.geocode(query)
            if location:
                cache[query] = {"lat": location.latitude, "lng": location.longitude}
                results.append(
                    {
                        "address": raw_address,
                        "lat": location.latitude,
                        "lng": location.longitude,
                        "status": "ok",
                    }
                )
            else:
                results.append(
                    {
                        "address": raw_address,
                        "lat": None,
                        "lng": None,
                        "status": "failed",
                    }
                )
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            results.append(
                {
                    "address": raw_address,
                    "lat": None,
                    "lng": None,
                    "status": f"error: {e}",
                }
            )

        if progress_callback:
            progress_callback(i + 1, len(addresses), raw_address, cached=False)

        # Respect Nominatim rate limit
        time.sleep(1.1)

    _save_cache(cache)
    return results
