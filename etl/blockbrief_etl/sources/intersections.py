import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "intersections"
TITLE = "Intersection File (Centreline Intersection)"
DATASET_URL = "https://open.toronto.ca/dataset/intersection-file-city-of-toronto/"
EXPECTS = ["'Centreline Intersection - 4326.csv' (downloads as centreline-intersection-4326.csv)"]

COLUMNS = ["INTERSECTION_ID", "INTERSECTION_DESC", "CLASSIFICATION_DESC", "geometry"]


def transform(files):
    frames = []
    for path in files:
        df = read_csv(path)
        require_columns(df, COLUMNS, path)
        frames.append(pd.DataFrame({
            "intersection_id": clean.integer(df["INTERSECTION_ID"]),
            "description": clean.text(df["INTERSECTION_DESC"]),
            "classification": clean.text(df["CLASSIFICATION_DESC"]),
            "source_file": path.name,
            "source_row_id": row_ids(df),
            "geom": clean.geojson_point_ewkt(df["geometry"]),
        }))
    out = pd.concat(frames, ignore_index=True)
    out = out[out["intersection_id"].notna() & out["geom"].notna()]
    # Multi-level intersections appear once per elevation with the same ID; keep one row.
    return {"intersections": out.drop_duplicates("intersection_id")}
