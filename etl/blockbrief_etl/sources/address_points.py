import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "address_points"
TITLE = "Address Points (Municipal) - Toronto One Address Repository"
DATASET_URL = "https://open.toronto.ca/dataset/address-points-municipal-toronto-one-address-repository/"
EXPECTS = ["'Address Points - 4326.csv' (downloads as address-points-4326.csv, ~180 MB)"]

COLUMNS = ["ADDRESS_POINT_ID", "ADDRESS_FULL", "MUNICIPALITY_NAME", "WARD", "PLACE_NAME", "geometry"]

# geometry is GeoJSON text. The CSV download holds a one-point MultiPoint
# ({"coordinates": [[-79.519, 43.599]], "type": "MultiPoint"}, checked on all 525k rows);
# the API returns a plain Point. The pattern accepts both.
_COORDS = r'"coordinates":\s*\[+\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)'


def transform(files):
    frames = []
    for path in files:
        df = read_csv(path)
        require_columns(df, COLUMNS, path)
        coords = df["geometry"].str.extract(_COORDS)
        frames.append(pd.DataFrame({
            "address_point_id": clean.integer(df["ADDRESS_POINT_ID"]),
            "address_full": clean.text(df["ADDRESS_FULL"]),
            "municipality": clean.text(df["MUNICIPALITY_NAME"]),
            "ward_number": clean.integer(df["WARD"]),
            "place_name": clean.text(df["PLACE_NAME"]),
            "source_file": path.name,
            "source_row_id": row_ids(df),
            "geom": clean.point_ewkt(coords[0], coords[1]),
        }))
    out = pd.concat(frames, ignore_index=True)
    # address_full and geom are NOT NULL in the schema
    out = out[out["address_full"].notna() & out["geom"].notna() & out["address_point_id"].notna()]
    return {"address_points": out.drop_duplicates("address_point_id")}
