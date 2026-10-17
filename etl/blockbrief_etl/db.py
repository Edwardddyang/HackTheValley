import json
import os

import numpy as np
import pandas as pd
import psycopg
from dotenv import load_dotenv

from . import clean
from .paths import ENV_FILE, MIGRATIONS_DIR


def connect() -> psycopg.Connection:
    load_dotenv(ENV_FILE)
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            f"DATABASE_URL is not set. Copy .env.example to {ENV_FILE} and paste your "
            "Supabase session pooler connection string."
        )
    # autocommit: each replace_table() transaction commits on its own. Without it, any read
    # (e.g. an enrich() lookup) opens an outer transaction, later loads become savepoints
    # inside it, and one failure rolls back every table loaded since.
    return psycopg.connect(url, autocommit=True)


def apply_migrations(conn: psycopg.Connection) -> list[str]:
    applied = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        conn.execute(path.read_text())
        applied.append(path.name)
    conn.commit()
    return applied


def replace_table(conn: psycopg.Connection, table: str, df: pd.DataFrame,
                  period_column: str | None = None) -> int:
    """Empty `table` and COPY df into it, in one transaction.

    df's columns must be real column names of `table`, except `source_file`, which is
    swapped for a source_id from the `sources` table. Geometry columns hold EWKT strings,
    which Postgres parses on input; dict values are written as JSON. Rows with a point geom
    are written in spatial order (see clean.spatial_order). If period_column is
    given, the earliest/latest date in it is stored on the file's `sources` row.
    """
    if "geom" in df.columns:
        df = df.iloc[clean.spatial_order(df["geom"]).argsort(kind="stable")]
    with conn.transaction():
        if "source_file" in df.columns:
            ids = {name: _source_id(conn, table, name) for name in df["source_file"].unique()}
            df = df.assign(source_file=df["source_file"].map(ids)).rename(columns={"source_file": "source_id"})
        cols = list(df.columns)
        # truncate (unlike delete) frees the space right away. cascade empties tables that
        # reference this one (e.g. 311 rows -> request types); their loader refills them next.
        conn.execute(f"truncate {table} cascade")
        with conn.cursor().copy(f"copy {table} ({', '.join(cols)}) from stdin") as copy:
            for row in df.itertuples(index=False, name=None):
                copy.write_row([_to_python(v) for v in row])
        # Rows arrive in spatial order, not key order, which leaves B-tree indexes half empty
        # (the 311 primary key doubled to 19 MB). Rebuild them compactly, one at a time so the
        # extra space needed at once is a single index, not the whole table's.
        for (index,) in conn.execute(
                "select indexname from pg_indexes where tablename = %s and indexdef like '%%USING btree%%'",
                (table,)).fetchall():
            conn.execute(f'reindex index "{index}"')
        if period_column and "source_id" in df.columns:
            for source_id, dates in df.groupby("source_id")[period_column]:
                dates = pd.to_datetime(dates.dropna())
                conn.execute("update sources set period_from = %s, period_to = %s where source_id = %s",
                             (dates.min().date(), dates.max().date(), source_id))
    return len(df)


def _source_id(conn: psycopg.Connection, table: str, file_name: str) -> int:
    return conn.execute(
        """insert into sources (dataset, file_name) values (%s, %s)
           on conflict (dataset, file_name) do update set loaded_at = now()
           returning source_id""",
        (table, file_name),
    ).fetchone()[0]


def _to_python(v):
    if v is None:
        return None
    if isinstance(v, dict):
        return json.dumps(v)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    return v
