import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "apartment_registrations"
TITLE = "Apartment Building Registration"
DATASET_URL = "https://open.toronto.ca/dataset/apartment-building-registration/"
EXPECTS = ["'Apartment Building Registration Data.csv' (downloads as apartment-building-registration-data.csv)"]

# What a landlord registered with the City for each RentSafeTO building (3+ storeys, 10+ units),
# joined to rentsafe_evaluations on rsn. Only the fields the brief shows are kept; the file has ~70.
_COLUMNS = {
    "rsn": "RSN", "site_address": "SITE_ADDRESS", "year_built": "YEAR_BUILT",
    "heating_type": "HEATING_TYPE", "heating_equipment_status": "HEATING_EQUIPMENT_STATUS",
    "heating_equipment_year": "HEATING_EQUIPMENT_YEAR_INSTALLED",
    "air_conditioning_type": "AIR_CONDITIONING_TYPE", "pets_allowed": "PETS_ALLOWED",
    "property_manager": "PROP_MANAGEMENT_COMPANY_NAME", "elevators": "NO_OF_ELEVATORS",
    "laundry_room": "LAUNDRY_ROOM",
}
# The file has both headers; the first non-blank is used (in the Oct 2026 file only the first is filled).
_COOLING_ROOM = ["IS_THERE_A_COOLING_ROOM", "IS_THERE_A_COOLING_ROOM?"]
_YES_NO = {"YES": True, "NO": False}


def _yes_no(df: pd.DataFrame, columns: list[str]) -> pd.Series:
    """First non-blank of `columns` as True/False; anything other than YES/NO is null."""
    value = pd.Series(None, index=df.index, dtype=object)
    for c in columns:
        if c in df.columns:
            value = value.where(value.notna(), clean.text(df[c]))
    return value.map(lambda v: _YES_NO.get(str(v).upper()) if v is not None else None).astype(object)


def transform(files):
    frames = []
    for path in files:
        df = read_csv(path)
        require_columns(df, list(_COLUMNS.values()), path)
        if not any(c in df.columns for c in _COOLING_ROOM):
            require_columns(df, _COOLING_ROOM[:1], path)  # neither spelling: report the usual one missing

        out = pd.DataFrame(index=df.index)
        out["source_file"] = path.name
        out["source_row_id"] = row_ids(df)
        for col, src in _COLUMNS.items():
            if col in ("rsn", "elevators"):
                out[col] = clean.integer(df[src])
            elif col in ("year_built", "heating_equipment_year"):
                out[col] = clean.year(df[src])
            elif col == "air_conditioning_type":
                # "NONE" is an answer here (no air conditioning), so it isn't nulled like clean.text does.
                ac = df[src].astype(object).str.strip()
                out[col] = ac.where(ac != "", None)
            else:
                out[col] = clean.text(df[src])
        # "375  BRUNSWICK AVE " -> "375 BRUNSWICK AVE", as in rentsafe_evaluations
        out["site_address"] = out["site_address"].map(lambda s: " ".join(s.split()) if s else None)
        # A few rows answer "NA" or "NIL" for the management company (clean.text already nulls N/A, NONE).
        out["property_manager"] = out["property_manager"].where(
            ~out["property_manager"].map(lambda s: str(s).upper() in ("NA", "NIL")), None)
        out["has_cooling_room"] = _yes_no(df, _COOLING_ROOM)
        frames.append(out)
    out = pd.concat(frames, ignore_index=True)
    # One row per building (rsn is the primary key); with several files, the first file's row is kept.
    out = out[out["rsn"].notna()].drop_duplicates("rsn")
    return {"apartment_registrations": out}
