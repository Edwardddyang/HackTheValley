import csv
import io
import zipfile

import pandas as pd

from .. import clean
from ._common import require_columns

FOLDER = "service_requests_311"
TITLE = "311 Service Requests - Customer Initiated"
DATASET_URL = "https://open.toronto.ca/dataset/311-service-requests-customer-initiated/"
EXPECTS = [
    "ONE yearly file only, e.g. SR2026.zip (the .zip as downloaded, or the CSV inside it).",
    "Each year is ~430k-500k rows; one year keeps the Supabase free tier comfortable.",
]

COLUMNS = ["Creation Date", "Status", "First 3 Chars of Postal Code", "Intersection Street 1",
           "Intersection Street 2", "Ward", "Service Request Type", "Division", "Section"]


DEPENDS_ON = ["intersections"]


def _norm(street):
    return " ".join(street.lower().split())


def enrich(conn, tables):
    """Place requests reported at an intersection on that intersection's point.

    Only ~19% of requests are reported at an intersection; the rest have just a postal FSA.
    A request is placed only when its two street names identify exactly one intersection.
    Pairs that match several (e.g. two streets that cross twice) are left unplaced rather
    than guessed. Tested on 2026: ~95% of intersection requests match, ~10% are ambiguous.
    """
    candidates = {}
    for intersection_id, description, geom in conn.execute(
            "select intersection_id, description, st_asewkt(geom) from intersections"):
        streets = sorted({_norm(s) for s in (description or "").split("/") if s.strip()})
        for i, a in enumerate(streets):
            for b in streets[i + 1:]:
                candidates.setdefault((a, b), {})[intersection_id] = geom
    if not candidates:
        print("    intersections is empty, so no 311 requests will be placed. Load it first.")

    df = tables["service_requests_311"]
    ids, geoms = [], []
    for s1, s2 in zip(df["intersection_street_1"], df["intersection_street_2"]):
        match = candidates.get(tuple(sorted((_norm(s1), _norm(s2))))) if s1 and s2 else None
        if match and len(match) == 1:
            (intersection_id, geom), = match.items()
        else:
            intersection_id = geom = None
        ids.append(intersection_id)
        geoms.append(geom)
    df["intersection_id"] = clean.integer(pd.Series(ids, index=df.index, dtype="Int64"))
    df["geom"] = geoms

    at_intersection = df["intersection_street_1"].notna() & df["intersection_street_2"].notna()
    placed = df["geom"].notna().sum()
    print(f"    placed {placed:,} of {at_intersection.sum():,} intersection requests "
          f"({len(df):,} requests in total)")
    return tables


def _open_text(path):
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as zf:
            member = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
            raw = zf.read(member)
    else:
        raw = path.read_bytes()
    # SR2026 is Windows-1252 (e.g. "CaféTO" is byte 0xE9), not UTF-8. Try UTF-8 first in
    # case other years differ.
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"{path.name}: neither UTF-8 nor Windows-1252; check the file.")
    if encoding != "utf-8-sig":
        print(f"    {path.name}: decoded as {encoding}")
    return io.StringIO(text, newline="")


def _rejoin_unquoted_commas(row):
    # Some names contain ", " but aren't quoted in the City's CSV, e.g. the division
    # "Environment, Climate & Forestry" (~9% of 2026 rows). Real separators are never
    # followed by a space, so a field starting with a space belongs to the previous one.
    merged = [row[0]]
    for v in row[1:]:
        if v.startswith(" "):
            merged[-1] += "," + v
        else:
            merged.append(v)
    return merged


def _read(path):
    rows, row_numbers, skipped = [], [], 0
    with _open_text(path) as f:
        reader = csv.reader(f)
        header = next(reader)
        for n, row in enumerate(reader, start=1):
            if len(row) > len(header):
                row = _rejoin_unquoted_commas(row)
            if len(row) != len(header):
                skipped += 1
                continue
            rows.append(row)
            row_numbers.append(n)
    if skipped:
        print(f"    {path.name}: skipped {skipped:,} rows that could not be split into {len(header)} columns")
    return pd.DataFrame(rows, columns=header), row_numbers


def transform(files):
    # One yearly file only, to stay within the Supabase free tier.
    if len(files) > 1:
        raise ValueError(
            f"Found {len(files)} files in data/raw/{FOLDER}/: {[f.name for f in files]}. "
            "Keep only one year's file here."
        )
    frames = []
    for path in files:
        df, row_numbers = _read(path)
        require_columns(df, COLUMNS, path)
        # "First 3 Chars of Postal Code" holds the literal word "Intersection" when the
        # location was given as two cross streets instead.
        fsa = clean.text(df["First 3 Chars of Postal Code"])
        fsa = fsa.where(fsa.astype("string").str.lower() != "intersection", None)
        ward = clean.text(df["Ward"])
        frames.append(pd.DataFrame({
            "source_file": path.name,
            "source_row_id": row_numbers,  # data row number; these files have no _id column
            # e.g. "2026-01-01 00:21:51.0000000": 7 fractional digits, keep to the second
            "created_at": clean.timestamp(df["Creation Date"].str.slice(0, 19)),
            "status": clean.text(df["Status"]),
            "fsa": fsa,
            "intersection_street_1": clean.text(df["Intersection Street 1"]),
            "intersection_street_2": clean.text(df["Intersection Street 2"]),
            "ward_number": clean.ward_number_from_name(ward),
            "request_type": clean.text(df["Service Request Type"]),
            "division": clean.text(df["Division"]),
            "section": clean.text(df["Section"]),
        }))
    requests = pd.concat(frames, ignore_index=True)
    # Division and section depend only on the request type, so store them once per type.
    types = requests[["request_type", "division", "section"]].dropna(subset=["request_type"])
    types = types.drop_duplicates("request_type")
    # Types load first: replacing them also empties service_requests_311 (foreign key).
    return {
        "sr311_request_types": types,
        "service_requests_311": requests.drop(columns=["division", "section"]),
    }
