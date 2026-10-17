import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "building_permits"
TITLE = "Building Permits (active + cleared)"
DATASET_URL = "https://open.toronto.ca/dataset/building-permits-active-permits/"
EXPECTS = [
    "'building-permits-active-permits.csv' from the Active Permits page above (~70 MB)",
    "'Cleared Building Permits since 2017.csv' from "
    "https://open.toronto.ca/dataset/building-permits-cleared-permits/ "
    "(downloads as cleared-building-permits-since-2017.csv, ~150 MB)",
    "The file name must contain 'active' or 'cleared' so the loader can tell them apart.",
]
DEPENDS_ON = ["address_points"]

# Storage budget (Supabase free tier): keep cleared permits completed from this date on.
# 2025-2026 is ~137k of the 444k cleared rows. Active permits are all kept.
CLEARED_SINCE = "2025-01-01"

COLUMNS = ["PERMIT_NUM", "REVISION_NUM", "PERMIT_TYPE", "STRUCTURE_TYPE", "WORK",
           "STREET_NUM", "STREET_NAME", "STREET_TYPE", "STREET_DIRECTION", "POSTAL", "GEO_ID",
           "APPLICATION_DATE", "ISSUED_DATE", "COMPLETED_DATE", "STATUS", "DESCRIPTION",
           "CURRENT_USE", "PROPOSED_USE", "DWELLING_UNITS_CREATED", "DWELLING_UNITS_LOST",
           "EST_CONST_COST"]



def enrich(conn, tables):
    """Give each permit its address point's location before loading.

    The permit files have no coordinates. GEO_ID is the Address Points ADDRESS_POINT_ID
    (checked: permit 19 155845 DRN, GEO_ID 865172 = address point 865172, 20 Saunders Ave).
    Done before COPY rather than as an UPDATE afterwards: an UPDATE rewrites every row and
    leaves the old copies behind, which doubled the table's size.
    """
    points = dict(conn.execute("select address_point_id, st_asewkt(geom) from address_points").fetchall())
    if not points:
        print("    address_points is empty, so permits will have no location. Load it first.")
    df = tables["building_permits"]
    df["geom"] = df["geo_id"].map(lambda g: points.get(g) if g is not None else None)
    return tables


def _group(path):
    name = path.name.lower()
    if "active" in name:
        return "active"
    if "cleared" in name:
        return "cleared"
    raise ValueError(f"{path.name}: rename it to include 'active' or 'cleared'.")


def transform(files):
    frames = []
    for path in files:
        group = _group(path)
        df = read_csv(path)
        require_columns(df, COLUMNS, path)
        if group == "cleared":
            keep = pd.to_datetime(df["COMPLETED_DATE"], errors="coerce") >= CLEARED_SINCE
            print(f"    {path.name}: keeping {keep.sum():,} of {len(df):,} cleared permits "
                  f"completed since {CLEARED_SINCE}")
            df = df[keep]
        frames.append(pd.DataFrame({
            "source_file": path.name,
            "source_row_id": row_ids(df),
            "permit_group": group,
            "permit_num": clean.text(df["PERMIT_NUM"]),
            "revision_num": clean.text(df["REVISION_NUM"]),
            "permit_type": clean.text(df["PERMIT_TYPE"]),
            "structure_type": clean.text(df["STRUCTURE_TYPE"]),
            "work": clean.text(df["WORK"]),
            "street_address": clean.street_address(df),
            "postal_fsa": clean.text(df["POSTAL"]),
            "geo_id": clean.integer(df["GEO_ID"]),
            "application_date": clean.date(df["APPLICATION_DATE"]),
            "issued_date": clean.date(df["ISSUED_DATE"]),
            "completed_date": clean.date(df["COMPLETED_DATE"]),
            "status": clean.text(df["STATUS"]),
            "description": clean.text(df["DESCRIPTION"]),
            "current_use": clean.text(df["CURRENT_USE"]),
            "proposed_use": clean.text(df["PROPOSED_USE"]),
            "dwelling_units_created": clean.integer(df["DWELLING_UNITS_CREATED"]),
            "dwelling_units_lost": clean.integer(df["DWELLING_UNITS_LOST"]),
            # Some rows hold placeholder text here; those become null.
            "est_const_cost": clean.number(df["EST_CONST_COST"].str.replace(r"[$,]", "", regex=True)),
        }))
    return {"building_permits": pd.concat(frames, ignore_index=True)}
