"""Helpers shared by the dataset modules."""

from pathlib import Path

import pandas as pd


def read_csv(path: Path, **kwargs) -> pd.DataFrame:
    """Read everything as text; the cleaning helpers decide types. Handles .csv and .zip."""
    return pd.read_csv(path, dtype=str, keep_default_na=False, **kwargs)


def require_columns(df: pd.DataFrame, columns: list[str], path: Path) -> None:
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise ValueError(
            f"{path.name}: missing expected columns {missing}.\n"
            f"Columns found: {list(df.columns)}\n"
            "This is probably a different file or a newer version of the dataset. "
            "Check the folder README for the expected file."
        )


def row_ids(df: pd.DataFrame) -> pd.Series:
    """The City's _id column when the file has one, else the 1-based data row number."""
    if "_id" in df.columns:
        return pd.to_numeric(df["_id"], errors="coerce").astype("Int64")
    return pd.Series(range(1, len(df) + 1), index=df.index, dtype="Int64")
