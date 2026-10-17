import re

import pandas as pd

from .. import clean

FOLDER = "ward_profiles"
TITLE = "Ward Profiles (25-ward model), 2021 Census"
DATASET_URL = "https://open.toronto.ca/dataset/ward-profiles-25-ward-model/"
EXPECTS = ["'2023-WardProfiles-2011-2021-CensusData' XLSX "
           "(downloads as 2023-wardprofiles-2011-2021-censusdata_rev0719.xlsx)"]

SHEET = "2021 One Variable"


def _ward_number(header: str) -> int | None:
    header = str(header).strip()
    if header == "Toronto":
        return 0
    m = re.fullmatch(r"Ward (\d+)", header)
    return int(m.group(1)) if m else None


def transform(files):
    rows = []
    for path in files:
        # Layout: a label-only row names a section ("Population", "Dwellings", ...),
        # then a header row ("", "Toronto", "Ward 1", ... "Ward 25"), then one variable per row
        # (indentation in the label shows nesting). Sections repeat down the sheet.
        sheet = pd.read_excel(path, sheet_name=SHEET, header=None, dtype=object)
        section, columns = None, None
        for i, r in sheet.iterrows():
            label, values = r.iloc[0], r.iloc[1:]
            if str(values.iloc[0]).strip() == "Toronto":
                columns = {j: _ward_number(v) for j, v in values.items()}
                continue
            if pd.isna(label):
                continue
            if values.isna().all():
                section = str(label).strip()
                continue
            if columns is None:
                continue
            for j, v in values.items():
                ward = columns.get(j)
                if ward is not None and pd.notna(v):
                    rows.append((ward, i + 1, section, str(label).rstrip(), v, path.name))
        if columns is None:
            raise ValueError(f"{path.name}: no 'Toronto / Ward 1 ...' header row found in sheet {SHEET!r}.")

    df = pd.DataFrame(rows, columns=["ward_number", "row_number", "section", "variable", "value", "source_file"])
    df["value_num"], df["value_text"] = clean.numeric_or_text(df["value"])
    return {"ward_profiles": df.drop(columns="value")}
