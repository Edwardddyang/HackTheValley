import geopandas as gpd
import pandas as pd

from .. import clean
from ._common import require_columns, row_ids

FOLDER = "wards"
TITLE = "City Wards (25-ward model) boundaries"
DATASET_URL = "https://open.toronto.ca/dataset/city-wards/"
EXPECTS = ["'City Wards Data - 4326.geojson' (downloads as city-wards-data-4326.geojson)"]


def transform(files):
    frames = []
    for path in files:
        gdf = gpd.read_file(path)
        require_columns(gdf, ["AREA_SHORT_CODE", "AREA_NAME"], path)
        if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(4326)
        frames.append(pd.DataFrame({
            "ward_number": clean.integer(gdf["AREA_SHORT_CODE"]),
            "ward_name": clean.text(gdf["AREA_NAME"]),
            "source_file": path.name,
            "source_row_id": row_ids(gdf),
            "geom": gdf.geometry.map(clean.multipolygon_ewkt),
        }))
    return {"wards": pd.concat(frames, ignore_index=True)}
