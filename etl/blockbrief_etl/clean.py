"""Small, shared cleaning helpers. Each returns pandas Series with None for unusable values."""

import re

import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon

# Verified against RentSafeTO rows, which carry both X/Y and lat/long:
# EPSG:7991 (NAD27 / MTM zone 10) has a median error of ~10 m; EPSG:2952 is ~220 m off.
CITY_XY_EPSG = 7991
_xy_to_lonlat = Transformer.from_crs(CITY_XY_EPSG, 4326, always_xy=True)

NULL_STRINGS = {"", "none", "nan", "null", "n/a"}


def text(s: pd.Series) -> pd.Series:
    s = s.astype("string").str.strip()
    s = s.mask(s.str.lower().isin(NULL_STRINGS))
    return s.astype(object).where(s.notna(), None)


def integer(s: pd.Series) -> pd.Series:
    n = pd.to_numeric(s, errors="coerce")
    return n.round().astype("Int64").astype(object).where(n.notna(), None)


def year(s: pd.Series) -> pd.Series:
    """Integer year; impossible values (e.g. RentSafeTO's "202510") become null, not guessed."""
    y = integer(s)
    return y.where(y.map(lambda v: v is not None and 1800 <= v <= 2100), None)


def number(s: pd.Series) -> pd.Series:
    n = pd.to_numeric(s, errors="coerce")
    return n.astype(object).where(n.notna(), None)


def numeric_or_text(s: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Split mixed spreadsheet cells: numbers go to the first series, anything else to the second."""
    num = number(s)
    return num, text(s).where(num.isna(), None)


def date(s: pd.Series) -> pd.Series:
    d = pd.to_datetime(s, errors="coerce")
    return d.dt.date.astype(object).where(d.notna(), None)


def timestamp(s: pd.Series) -> pd.Series:
    d = pd.to_datetime(s, errors="coerce")
    return d.astype(object).where(d.notna(), None)


def street_address(df: pd.DataFrame) -> pd.Series:
    """Join STREET_NUM / STREET_NAME / STREET_TYPE / STREET_DIRECTION into one string."""
    parts = [text(df[c]).fillna("") for c in ("STREET_NUM", "STREET_NAME", "STREET_TYPE", "STREET_DIRECTION")]
    joined = parts[0].str.cat(parts[1:], sep=" ").str.replace(r"\s+", " ", regex=True).str.strip()
    return joined.where(joined != "", None)


def point_ewkt(lon: pd.Series, lat: pd.Series) -> pd.Series:
    lon = pd.to_numeric(lon, errors="coerce")
    lat = pd.to_numeric(lat, errors="coerce")
    ok = lon.notna() & lat.notna()
    out = pd.Series(None, index=lon.index, dtype=object)
    if ok.any():
        out[ok] = "SRID=4326;POINT(" + lon[ok].astype(str) + " " + lat[ok].astype(str) + ")"
    return out


# A few Development Applications rows (43 of 25.8k) are in UTM zone 17N instead; their X is
# ~600k+ where MTM X is ~290-320k. UTM puts all 43 inside the ward the row names.
_utm_to_lonlat = Transformer.from_crs(26917, 4326, always_xy=True)

# Generous box around the city; anything outside is a bad coordinate.
TORONTO_BBOX = (-79.70, 43.55, -79.10, 43.88)  # min lon, min lat, max lon, max lat


# GeoJSON point text. City CSV downloads hold a one-point MultiPoint
# ({"coordinates": [[-79.519, 43.599]], "type": "MultiPoint"}); the API returns a plain Point.
_GEOJSON_COORDS = r'"coordinates":\s*\[+\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)'


def geojson_point_ewkt(s: pd.Series) -> pd.Series:
    coords = s.astype("string").str.extract(_GEOJSON_COORDS)
    return point_ewkt(coords[0], coords[1])


def city_xy_to_ewkt(x: pd.Series, y: pd.Series) -> pd.Series:
    x = pd.to_numeric(x, errors="coerce")
    y = pd.to_numeric(y, errors="coerce")
    ok = x.notna() & y.notna() & (x > 0) & (y > 0)
    utm = ok & (x > 400_000)
    lon = pd.Series(np.nan, index=x.index)
    lat = pd.Series(np.nan, index=x.index)
    for mask, transformer in ((ok & ~utm, _xy_to_lonlat), (utm, _utm_to_lonlat)):
        if mask.any():
            lon[mask], lat[mask] = transformer.transform(x[mask].to_numpy(), y[mask].to_numpy())
    min_lon, min_lat, max_lon, max_lat = TORONTO_BBOX
    outside = lon.notna() & ~(lon.between(min_lon, max_lon) & lat.between(min_lat, max_lat))
    if outside.any():
        print(f"    dropped {outside.sum():,} coordinates outside Toronto")
        lon[outside] = lat[outside] = np.nan
    return point_ewkt(lon, lat)


_POINT_EWKT = r"^SRID=4326;POINT\((-?[\d.]+) (-?[\d.]+)\)$"


def spatial_order(geom: pd.Series) -> pd.Series:
    """Sort key that puts nearby points next to each other (a Z-order / Morton curve).

    Rows are written in this order so a radius query reads a few disk pages instead of one
    page per row; that is what makes cold queries fast. Non-point rows sort last.
    """
    xy = geom.astype("string").str.extract(_POINT_EWKT).astype(float)
    ok = xy.notna().all(axis=1)
    min_lon, min_lat, max_lon, max_lat = TORONTO_BBOX
    x = ((xy[0] - min_lon) / (max_lon - min_lon) * 65535).clip(0, 65535).fillna(0).to_numpy(np.int64)
    y = ((xy[1] - min_lat) / (max_lat - min_lat) * 65535).clip(0, 65535).fillna(0).to_numpy(np.int64)
    key = np.zeros(len(geom), dtype=np.int64)
    for bit in range(16):
        key |= ((x >> bit) & 1) << (2 * bit)
        key |= ((y >> bit) & 1) << (2 * bit + 1)
    return pd.Series(key, index=geom.index).where(ok, np.iinfo(np.int64).max)


def multipolygon_ewkt(geom) -> str:
    if isinstance(geom, Polygon):
        geom = MultiPolygon([geom])
    return "SRID=4326;" + geom.wkt


_WARD_IN_PARENS = re.compile(r"\((\d+)\)\s*$")


def ward_number_from_name(s: pd.Series) -> pd.Series:
    """'Beaches-East York (19)' -> 19"""
    return integer(text(s).astype("string").str.extract(_WARD_IN_PARENS, expand=False))
