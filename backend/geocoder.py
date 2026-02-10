"""Geocoder module: converts street addresses to lat/lng coordinates using Nominatim."""

import json
import os
import re
import time
from typing import Generator, Optional

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError


CACHE_FILE = os.path.join(os.path.dirname(__file__), "geocode_cache.json")

# Module-level geolocator (reused across calls)
_geolocator = Nominatim(user_agent="travel-route-optimiser/1.0", timeout=10)

# Patterns that indicate the address already contains city/country info
_CITY_PATTERNS = re.compile(
    r"(københavn|copenhagen|kbh|frederiksberg|denmark|danmark)",
    re.IGNORECASE,
)

# Pattern to detect a street-like component (contains a number after letters)
_STREET_LIKE_RE = re.compile(r"[a-zA-ZæøåÆØÅé].*\d")

# Pattern to strip floor/apartment/unit numbers, c/o, and English floor indicators
# Matches: ", 2", ", st", ", 1. sal", ", 1st floor", ", c/o", ", kld"
_FLOOR_RE = re.compile(
    r",\s*(?:"
    r"\d{1,2}\.?\s*(?:sal|th|tv|mf|floor)?"
    r"|st\.?"
    r"|kld\.?"
    r"|\d+(?:st|nd|rd|th)\s*floor"
    r"|c/o"
    r")\s*(?=,|$)",
    re.IGNORECASE,
)

# Common Danish street abbreviations -> full form
_ABBREVIATIONS = {
    "blvd.": "Boulevard",
    "blvd": "Boulevard",
    "gl.": "Gammel",
    "gl ": "Gammel ",
    "st.": "Store",
    "nr.": "Nummer",
    "vej.": "Vej",
    "allé.": "Allé",
    "pl.": "Plads",
    "pl ": "Plads ",
    "str.": "Stræde",
    "bgd.": "Borgergade",
    "skt.": "Sankt",
    "dr.": "Doktor",
    "kgs.": "Kongens",
}

# Frederiksberg postal codes (2000, 2720 etc.) -- these are NOT København
_FREDERIKSBERG_POSTCODES = {"2000", "2720", "1800", "1850", "1900", "1950"}


def _expand_abbreviations(text: str) -> str:
    """Expand common Danish street name abbreviations."""
    result = text
    for abbr, full in _ABBREVIATIONS.items():
        # Build a case-insensitive word-boundary pattern for each abbreviation.
        # re.escape handles the dot; \b ensures we match whole tokens.
        pattern = r"\b" + re.escape(abbr)
        result = re.sub(pattern, full, result, flags=re.IGNORECASE)
    return result


def _strip_non_address_prefix(addr: str) -> str:
    """
    Strip leading comma-separated components that don't look like street addresses.
    
    Handles business names (e.g., "Galleri K, Antonigade 4, ...") and garbage text
    (e.g., "TJEK INSTAGRAM FOR..., Sølvgade 85B, ...").
    """
    parts = [p.strip() for p in addr.split(",")]
    
    # Walk through parts until we find one that looks like a street address
    for i, part in enumerate(parts):
        if _STREET_LIKE_RE.search(part):
            return ", ".join(parts[i:])
    
    # If nothing looks like a street, return the original
    return addr


def _fix_frederiksberg_postcode(addr: str) -> str:
    """
    If the address has a Frederiksberg postal code but says 'København',
    replace it with 'Frederiksberg'.
    """
    for pc in _FREDERIKSBERG_POSTCODES:
        if pc in addr and "københavn" in addr.lower() and "frederiksberg" not in addr.lower():
            return re.sub(r"København\b", "Frederiksberg", addr, flags=re.IGNORECASE)
    return addr


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


def _build_queries(raw_address: str, city_suffix: str) -> list[str]:
    """
    Build a list of geocoding queries to try, from most specific to least.

    Applies progressive cleaning:
      1. Strip non-address prefixes (business names, junk text)
      2. Expand abbreviations (Blvd. -> Boulevard)
      3. Fix Frederiksberg postal codes mislabelled as København
      4. Strip floor/apartment/c/o indicators
      5. Fallback to just street name + city suffix
    """
    queries: list[str] = []

    def _add(q: str):
        q = q.strip().rstrip(",").strip()
        if q and q not in queries:
            queries.append(q)

    addr = raw_address.strip()

    # --- Step 1: Strip non-address prefix (business names, junk text) ---
    addr_clean = _strip_non_address_prefix(addr)

    # --- Step 2: Expand abbreviations ---
    addr_clean = _expand_abbreviations(addr_clean)

    # --- Step 3: Fix Frederiksberg postal codes ---
    addr_fixed_city = _fix_frederiksberg_postcode(addr_clean)

    # --- Step 4: Strip floor/unit/c/o ---
    addr_no_floor = _FLOOR_RE.sub("", addr_fixed_city).strip().rstrip(",").strip()

    already_has_city = bool(_CITY_PATTERNS.search(addr_clean))

    if already_has_city:
        # Try with city fix first (most likely to help)
        _add(addr_fixed_city)
        # Then with floor stripped
        _add(addr_no_floor)
        # Try the cleaned version without city fix
        _add(addr_clean)
    else:
        _add(addr_clean + city_suffix)
        _add(addr_no_floor + city_suffix)

    # --- Step 5: Fallback -- just the street component + city suffix ---
    parts = [p.strip() for p in addr_clean.split(",")]
    for part in parts:
        if _STREET_LIKE_RE.search(part):
            street_only = part.strip()
            _add(street_only + city_suffix)
            # Also try with abbreviations expanded on just the street
            _add(_expand_abbreviations(street_only) + city_suffix)
            break

    return queries


def _geocode_single(
    raw_address: str,
    city_suffix: str,
    cache: dict,
) -> dict:
    """
    Try to geocode a single address using multiple query strategies.

    Returns dict with keys: address, lat, lng, status.
    Updates the cache dict in-place on success.
    """
    queries = _build_queries(raw_address, city_suffix)

    for query in queries:
        # Check cache
        if query in cache:
            return {
                "address": raw_address,
                "lat": cache[query]["lat"],
                "lng": cache[query]["lng"],
                "status": "ok",
                "_cached": True,
            }

        # Query Nominatim
        try:
            location = _geolocator.geocode(query)
            if location:
                cache[query] = {"lat": location.latitude, "lng": location.longitude}
                return {
                    "address": raw_address,
                    "lat": location.latitude,
                    "lng": location.longitude,
                    "status": "ok",
                    "_cached": False,
                }
        except (GeocoderTimedOut, GeocoderServiceError):
            pass

        # Rate limit between attempts
        time.sleep(1.1)

    return {
        "address": raw_address,
        "lat": None,
        "lng": None,
        "status": "failed",
        "_cached": False,
    }


def geocode_addresses_iter(
    addresses: list[str],
    city_suffix: str = ", Copenhagen, Denmark",
) -> Generator[dict, None, None]:
    """
    Geocode addresses one at a time, yielding each result immediately.

    Yields dicts with keys: address, lat, lng, status, index, total.
    This allows the caller to stream progress to a client.
    """
    cache = _load_cache()
    total = len(addresses)

    for i, raw_address in enumerate(addresses):
        result = _geocode_single(raw_address, city_suffix, cache)

        yield {
            "address": result["address"],
            "lat": result["lat"],
            "lng": result["lng"],
            "status": result["status"],
            "index": i,
            "total": total,
        }

        # If it wasn't a cache hit, the rate limit sleep already happened
        # inside _geocode_single. If it was cached, no sleep needed.

    _save_cache(cache)


def geocode_addresses(
    addresses: list[str],
    city_suffix: str = ", Copenhagen, Denmark",
    progress_callback: Optional[callable] = None,
) -> list[dict]:
    """
    Geocode a list of street addresses (non-streaming convenience wrapper).

    Returns a list of dicts with keys: address, lat, lng, status.
    """
    results = []
    for item in geocode_addresses_iter(addresses, city_suffix):
        results.append({
            "address": item["address"],
            "lat": item["lat"],
            "lng": item["lng"],
            "status": item["status"],
        })
        if progress_callback:
            progress_callback(
                item["index"] + 1, item["total"], item["address"],
                cached=False,
            )
    return results
