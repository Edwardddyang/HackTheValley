import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "rentsafe"
TITLE = "Apartment Building Evaluations (RentSafeTO)"
DATASET_URL = "https://open.toronto.ca/dataset/apartment-building-evaluation/"
EXPECTS = [
    "'Apartment Building Evaluations 2023 - current.csv' (downloads as apartment-building-evaluations-2023-current.csv)",
    "Optional, older evaluations: 'Pre-2023 Apartment Building Evaluations.csv' "
    "(downloads as pre-2023-apartment-building-evaluations.csv)",
]

# The two files use different column names and score different categories.
_CORE = {
    "2023+": {
        "rsn": "RSN", "site_address": "SITE ADDRESS", "property_type": "PROPERTY TYPE",
        "ward_number": "WARD", "ward_name": "WARDNAME", "year_built": "YEAR BUILT",
        "year_registered": "YEAR REGISTERED", "year_evaluated": "YEAR EVALUATED",
        "storeys": "CONFIRMED STOREYS", "units": "CONFIRMED UNITS",
        "evaluation_date": "EVALUATION COMPLETED ON", "score": "CURRENT BUILDING EVAL SCORE",
        "proactive_score": "PROACTIVE BUILDING SCORE", "reactive_score": "CURRENT REACTIVE SCORE",
        "areas_evaluated": "NO OF AREAS EVALUATED",
    },
    "pre-2023": {
        "rsn": "RSN", "site_address": "SITE_ADDRESS", "property_type": "PROPERTY_TYPE",
        "ward_number": "WARD", "ward_name": "WARDNAME", "year_built": "YEAR_BUILT",
        "year_registered": "YEAR_REGISTERED", "year_evaluated": "YEAR_EVALUATED",
        "storeys": "CONFIRMED_STOREYS", "units": "CONFIRMED_UNITS",
        "evaluation_date": "EVALUATION_COMPLETED_ON", "score": "SCORE",
        "result_text": "RESULTS_OF_SCORE", "areas_evaluated": "NO_OF_AREAS_EVALUATED",
    },
}
_NOT_ITEMS = {"_id", "GRID", "LATITUDE", "LONGITUDE", "X", "Y"}
_YEAR = {"year_built", "year_registered", "year_evaluated"}
_INT = {"rsn", "ward_number", "storeys", "units", "areas_evaluated"}
_NUM = {"score", "proactive_score", "reactive_score"}


def _schema(df):
    return "2023+" if "CURRENT BUILDING EVAL SCORE" in df.columns else "pre-2023"


def _item_value(v):
    v = (v or "").strip()
    if v == "" or v.upper() == "N/A":
        return None
    try:
        return int(v)
    except ValueError:
        return v


def transform(files):
    frames = []
    for path in files:
        df = read_csv(path)
        version = _schema(df)
        core = _CORE[version]
        require_columns(df, list(core.values()) + ["LATITUDE", "LONGITUDE", "X", "Y"], path)

        out = pd.DataFrame(index=df.index)
        out["source_file"] = path.name
        out["source_row_id"] = row_ids(df)
        out["schema_version"] = version
        for col, src in core.items():
            if col in _YEAR:
                out[col] = clean.year(df[src])
            elif col in _INT:
                out[col] = clean.integer(df[src])
            elif col in _NUM:
                out[col] = clean.number(df[src])
            elif col == "evaluation_date":
                out[col] = clean.date(df[src])
            else:
                out[col] = clean.text(df[src])

        item_cols = [c for c in df.columns if c not in _NOT_ITEMS and c not in core.values()]
        out["item_scores"] = [
            {k: v for k, v in ((c, _item_value(r[c])) for c in item_cols) if v is not None}
            for r in df[item_cols].to_dict("records")
        ]

        geom = clean.point_ewkt(df["LONGITUDE"], df["LATITUDE"])
        out["geom"] = geom.where(geom.notna(), clean.city_xy_to_ewkt(df["X"], df["Y"]))
        frames.append(out)
    return {"rentsafe_evaluations": pd.concat(frames, ignore_index=True)}
