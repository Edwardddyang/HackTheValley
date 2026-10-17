import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "address_points"
TITLE = "Address Points (Municipal) - Toronto One Address Repository"
DATASET_URL = "https://open.toronto.ca/dataset/address-points-municipal-toronto-one-address-repository/"
EXPECTS = ["'Address Points - 4326.csv' (downloads as address-points-4326.csv, ~180 MB)"]

COLUMNS = ["ADDRESS_POINT_ID", "ADDRESS_FULL", "MUNICIPALITY_NAME", "WARD", "PLACE_NAME", "geometry"]



def transform(files):
    frames = []
    for path in files:
        df = read_csv(path)
        require_columns(df, COLUMNS, path)
        frames.append(pd.DataFrame({
            "address_point_id": clean.integer(df["ADDRESS_POINT_ID"]),
            "address_full": clean.text(df["ADDRESS_FULL"]),
            "municipality": clean.text(df["MUNICIPALITY_NAME"]),
            "ward_number": clean.integer(df["WARD"]),
            "place_name": clean.text(df["PLACE_NAME"]),
            "source_file": path.name,
            "source_row_id": row_ids(df),
            "geom": clean.geojson_point_ewkt(df["geometry"]),  # one-point MultiPoint in all 525k rows
        }))
    out = pd.concat(frames, ignore_index=True)
    # address_full and geom are NOT NULL in the schema
    out = out[out["address_full"].notna() & out["geom"].notna() & out["address_point_id"].notna()]
    return {"address_points": out.drop_duplicates("address_point_id")}
