import re

import openpyxl
import pandas as pd
from openpyxl.utils import column_index_from_string

FOLDER = "cmhc_rents"
TITLE = "CMHC Rental Market Survey, Toronto (Rental Market Report data tables)"
DATASET_URL = ("https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/"
               "housing-data/data-tables/rental-market/rental-market-report-data-tables")
EXPECTS = ["The Toronto workbook, 2025: rmr-toronto-2025-en.xlsx, from "
           "https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/"
           "housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-toronto-2025-en.xlsx"]

# Purpose-built private apartments, surveyed each October. Two sheets are read:
#   Table 1.1.2  average rent by zone and bedroom type, last two Octobers (the latest is kept).
#   Table 1.1.9  average rent of units vacant vs occupied at the latest October.
# Both list the zones in the same spreadsheet rows, so source_row_id (the row) cites either.
# Every value has a reliability code: a excellent, b very good, c good, d poor (use with
# caution). "**" means CMHC suppressed it; it is stored as null.
AVERAGE_SHEET = "Table 1.1.2"
VACANT_SHEET = "Table 1.1.9"

BEDROOMS = ["studio", "one", "two", "three_plus", "total"]
# Per bedroom type: latest October's (value, reliability) columns in Table 1.1.2 ...
_AVERAGE_COLS = [("D", "E"), ("H", "I"), ("L", "M"), ("P", "Q"), ("T", "U")]
# ... and (vacant, reliability, occupied, reliability) columns in Table 1.1.9.
_VACANT_COLS = [("B", "C", "D", "E"), ("G", "H", "I", "J"), ("L", "M", "N", "O"),
                ("Q", "R", "S", "T"), ("V", "W", "X", "Y")]

# City of Toronto rows only: zones 1-17 and the group rows for the former municipalities.
_ZONE = re.compile(r"^Zone ([1-9]|1[0-7]) - ")
GROUPS = ["Former City of Toronto (Zones 1-4)", "Etobicoke (Zones 5-7)", "Scarborough (Zones 10-12)",
          "North York (Zones 13-17)", "City of Toronto (Zones 1-17)"]
# address_points.municipality -> the CMHC row that covers it. York and East York are one zone each.
MUNICIPALITY_AREAS = {
    "former Toronto": "Former City of Toronto (Zones 1-4)",
    "Etobicoke": "Etobicoke (Zones 5-7)",
    "York": "Zone 8 - York",
    "East York": "Zone 9 - East York",
    "Scarborough": "Scarborough (Zones 10-12)",
    "North York": "North York (Zones 13-17)",
}
_AREA_MUNICIPALITY = {area: m for m, area in MUNICIPALITY_AREAS.items()}


def _cell(values: tuple, column: str):
    i = column_index_from_string(column) - 1
    return values[i] if i < len(values) else None


def _text(v) -> str:
    return "" if v is None else str(v).strip()


def _rent(v) -> int | None:
    """'1,606' or 1606 -> 1606; '**' (suppressed) or blank -> None."""
    if isinstance(v, (int, float)):
        return round(v)
    s = _text(v).replace(",", "")
    return round(float(s)) if re.fullmatch(r"\d+(\.\d+)?", s) else None


def _reliability(v) -> str | None:
    s = _text(v).lower()
    return s if s in ("a", "b", "c", "d") else None


def _sheet(wb, name: str, path):
    if name not in wb.sheetnames:
        raise ValueError(f"{path.name}: no sheet {name!r} (sheets: {wb.sheetnames[:12]} ...). "
                         "Check the folder README for the expected file.")
    return wb[name]


def _toronto_rows(ws) -> tuple[dict, dict]:
    """Toronto area rows {area: (spreadsheet row, values)} and the column header row ("Zone | ...")."""
    areas, header = {}, None
    for row_number, values in enumerate(ws.iter_rows(min_row=1, max_col=25, values_only=True), start=1):
        label = _text(values[0])
        if label == "Zone" and header is None:
            header = values
        elif _ZONE.match(label) or label in GROUPS:
            areas[label] = (row_number, values)
    return areas, header


def _survey_year(header, path) -> int:
    """Table 1.1.2's latest-October columns are headed like 'Oct-25'; all five must agree."""
    years = set()
    for value_col, _ in _AVERAGE_COLS:
        m = re.fullmatch(r"Oct-(\d\d)", _text(_cell(header, value_col))) if header else None
        if not m:
            raise ValueError(f"{path.name}: expected 'Oct-YY' in {AVERAGE_SHEET} column {value_col} of the "
                             "'Zone' header row. Layout changed?")
        years.add(2000 + int(m.group(1)))
    if len(years) != 1:
        raise ValueError(f"{path.name}: {AVERAGE_SHEET} latest-October headers disagree: {sorted(years)}")
    return years.pop()


def _check_vacant_header(header, path) -> None:
    for vacant_col, _, occupied_col, _ in _VACANT_COLS:
        if not header or (_text(_cell(header, vacant_col)), _text(_cell(header, occupied_col))) != (
                "Vacant Units", "Occupied Units"):
            raise ValueError(f"{path.name}: expected 'Vacant Units' / 'Occupied Units' in {VACANT_SHEET} "
                             f"columns {vacant_col} / {occupied_col}. Layout changed?")


def transform(files):
    rows = []
    for path in files:
        wb = openpyxl.load_workbook(path, data_only=True)
        average, average_header = _toronto_rows(_sheet(wb, AVERAGE_SHEET, path))
        vacant, vacant_header = _toronto_rows(_sheet(wb, VACANT_SHEET, path))
        survey_year = _survey_year(average_header, path)
        _check_vacant_header(vacant_header, path)

        expected = 17 + len(GROUPS)
        if len(average) != expected or set(vacant) != set(average):
            raise ValueError(f"{path.name}: expected the same {expected} City of Toronto rows (Zone 1-17 + "
                             f"{len(GROUPS)} groups) in both sheets; found {len(average)} in {AVERAGE_SHEET} "
                             f"and {len(vacant)} in {VACANT_SHEET}.")
        moved = [a for a in average if average[a][0] != vacant[a][0]]
        if moved:
            raise ValueError(f"{path.name}: {moved} are on different rows in the two sheets, so one row "
                             "number can no longer cite both. Layout changed?")

        for area, (row_number, avg) in average.items():
            vac = vacant[area][1]
            for bedrooms, (a, a_rel), (v, v_rel, o, o_rel) in zip(BEDROOMS, _AVERAGE_COLS, _VACANT_COLS):
                row = {"area": area, "municipality": _AREA_MUNICIPALITY.get(area), "bedrooms": bedrooms,
                       "survey_year": survey_year}
                for col, sheet_row, value_col, reliability_col in (
                        ("average_rent", avg, a, a_rel),
                        ("vacant_unit_rent", vac, v, v_rel),
                        ("occupied_unit_rent", vac, o, o_rel)):
                    rent = _rent(_cell(sheet_row, value_col))
                    row[col] = rent
                    row[f"{col}_reliability"] = _reliability(_cell(sheet_row, reliability_col)) if rent is not None else None
                row["source_file"] = path.name
                row["source_row_id"] = row_number
                rows.append(row)
    # object dtype keeps whole numbers as ints and blanks as None (a float column would COPY "1713.0").
    return {"cmhc_rents": pd.DataFrame(rows, dtype=object)}
