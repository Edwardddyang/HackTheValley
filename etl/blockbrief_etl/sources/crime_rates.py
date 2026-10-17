import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "crime_rates"
TITLE = "Neighbourhood Crime Rates (Toronto Police Service)"
DATASET_URL = "https://open.toronto.ca/dataset/neighbourhood-crime-rates/"
EXPECTS = ["'neighbourhood-crime-rates - 4326.csv' (downloads as neighbourhood-crime-rates-4326.csv)"]

# Wide columns look like ASSAULT_2025 (count), ASSAULT_RATE_2025 (per 100k), POPULATION_2025.
_COL = r"^(?P<offence>[A-Z]+?)(?P<rate>_RATE)?_(?P<year>\d{4})$"


def transform(files):
    crime, population = [], []
    for path in files:
        df = read_csv(path)
        require_columns(df, ["HOOD_ID", "AREA_NAME"], path)
        df["_row"] = row_ids(df)
        value_cols = [c for c in df.columns if pd.Series([c]).str.match(_COL).iloc[0]]
        long = df.melt(id_vars=["HOOD_ID", "AREA_NAME", "_row"], value_vars=value_cols,
                       var_name="column", value_name="value")
        parts = long["column"].str.extract(_COL)
        long = long.assign(offence=parts["offence"], is_rate=parts["rate"].notna(),
                           year=parts["year"].astype(int))

        pop = long[long["offence"] == "POPULATION"]
        population.append(pd.DataFrame({
            "hood_id": clean.integer(pop["HOOD_ID"]),
            "year": pop["year"],
            "population": clean.integer(pop["value"]),
            "source_file": path.name,
            "source_row_id": pop["_row"],
        }))

        # The file never contains a literal 0; a blank count (always paired with a blank
        # rate) means no incidents that year, so blanks are stored as 0.
        long = long[long["offence"] != "POPULATION"]
        long["value"] = long["value"].replace("", "0")
        wide = long.pivot_table(index=["HOOD_ID", "AREA_NAME", "_row", "offence", "year"],
                                columns="is_rate", values="value", aggfunc="first").reset_index()
        crime.append(pd.DataFrame({
            "hood_id": clean.integer(wide["HOOD_ID"]),
            "offence": wide["offence"],
            "year": wide["year"],
            "count": clean.integer(wide.get(False, pd.Series(index=wide.index, dtype=str))),
            "rate_per_100k": clean.number(wide.get(True, pd.Series(index=wide.index, dtype=str))),
            "source_file": path.name,
            "source_row_id": wide["_row"],
        }))
    return {
        "crime_rates": pd.concat(crime, ignore_index=True),
        "neighbourhood_population": pd.concat(population, ignore_index=True),
    }
