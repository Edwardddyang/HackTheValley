import pandas as pd

from .. import clean

FOLDER = "neighbourhood_profiles"
TITLE = "Neighbourhood Profiles, 2021 Census (158 model)"
DATASET_URL = "https://open.toronto.ca/dataset/neighbourhood-profiles/"
EXPECTS = ["'neighbourhood-profiles-2021-158-model' XLSX (downloads as nbhd_2021_census_profile_full_158model.xlsx)"]

SHEET = "hd2021_census_profile"


def transform(files):
    variables, values = [], []
    for path in files:
        # Layout: row 0 = neighbourhood names, row 1 = neighbourhood numbers,
        # rows 2+ = one census variable per row, one neighbourhood per column.
        sheet = pd.read_excel(path, sheet_name=SHEET, header=None, dtype=object)
        if str(sheet.iat[1, 0]).strip() != "Neighbourhood Number":
            raise ValueError(f"{path.name}: expected 'Neighbourhood Number' in cell A2, "
                             f"found {sheet.iat[1, 0]!r}. Layout changed?")
        hood_ids = clean.integer(sheet.iloc[1, 1:])
        body = sheet.iloc[2:].copy()
        body.columns = ["variable"] + list(hood_ids)
        body = body[body["variable"].notna()]
        body["variable"] = body["variable"].astype(str).str.strip()
        body["row_number"] = body.index + 1  # spreadsheet row, 1-based

        # Each "Total - ..." row starts a topic; the rows under it belong to that topic.
        is_topic = body["variable"].str.startswith("Total - ")
        topic = body["variable"].where(is_topic).ffill()
        variables.append(pd.DataFrame({
            "row_number": body["row_number"],
            "topic": topic.astype(object).where(topic.notna(), None),
            "variable": body["variable"],
        }))

        long = body.melt(id_vars=["variable", "row_number"], var_name="hood_id", value_name="value")
        num, txt = clean.numeric_or_text(long["value"])
        values.append(pd.DataFrame({
            "hood_id": long["hood_id"].astype(int),
            "row_number": long["row_number"],
            "value_num": num,
            "value_text": txt,
            "source_file": path.name,
        }))
    # Variables load first: replacing them also empties neighbourhood_profiles (foreign key).
    return {
        "neighbourhood_profile_variables": pd.concat(variables).drop_duplicates("row_number"),
        "neighbourhood_profiles": pd.concat(values, ignore_index=True),
    }
