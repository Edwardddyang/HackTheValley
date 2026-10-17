import geopandas as gpd
import pandas as pd

from .. import clean
from ._common import require_columns, row_ids

FOLDER = "neighbourhoods"
TITLE = "Neighbourhoods (158 model) boundaries"
DATASET_URL = "https://open.toronto.ca/dataset/neighbourhoods/"
EXPECTS = ["'Neighbourhoods - 4326.geojson' (downloads as neighbourhoods-4326.geojson; "
           "not the 'historical 140' file)"]


def transform(files):
    frames = []
    for path in files:
        gdf = gpd.read_file(path)
        require_columns(gdf, ["AREA_SHORT_CODE", "AREA_NAME", "CLASSIFICATION", "CLASSIFICATION_CODE"], path)
        if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(4326)
        frames.append(pd.DataFrame({
            "hood_id": clean.integer(gdf["AREA_SHORT_CODE"]),
            "area_name": clean.text(gdf["AREA_NAME"]),
            "classification": clean.text(gdf["CLASSIFICATION"]),
            "classification_code": clean.text(gdf["CLASSIFICATION_CODE"]),
            "source_file": path.name,
            "source_row_id": row_ids(gdf),
            "geom": gdf.geometry.map(clean.multipolygon_ewkt),
        }))
    return {"neighbourhoods": pd.concat(frames, ignore_index=True)}
