"""bb - Block Brief data tool.

  bb folders            create data/raw/<dataset>/ folders with a README saying what to put there
  bb status             which datasets have files dropped in
  bb check  <ds|all>    clean/transform the files and print a preview (no database needed)
  bb init-db            create tables in Supabase (runs supabase/migrations/*.sql)
  bb reset-db --yes     drop all Block Brief tables and recreate them empty (after schema changes)
  bb load   <ds|all>    transform and load into Supabase (replaces that dataset's rows)
  bb near   "<address>" [--radius 500]   smoke test: what's loaded near an address
"""

import argparse
import sys
import time

import pandas as pd

from . import db, sources
from .paths import RAW_DIR, raw_files


def _pick(name: str):
    if name == "all":
        return sources.ALL
    if name not in sources.BY_FOLDER:
        raise SystemExit(f"Unknown dataset {name!r}. Choose from: all, {', '.join(sources.BY_FOLDER)}")
    return [sources.BY_FOLDER[name]]


def _transform(mod):
    files = raw_files(mod.FOLDER)
    if not files:
        print(f"  skip {mod.FOLDER}: no files in data/raw/{mod.FOLDER}/")
        return None
    t = time.time()
    tables = mod.transform(files)
    print(f"  {mod.FOLDER}: read {len(files)} file(s) in {time.time() - t:.1f}s")
    return tables


def cmd_folders(_args):
    for mod in sources.ALL:
        d = RAW_DIR / mod.FOLDER
        d.mkdir(parents=True, exist_ok=True)
        lines = [f"# {mod.TITLE}", "", f"Download from: {mod.DATASET_URL}", "",
                 "Put these file(s) in this folder, unchanged:", ""]
        lines += [f"- {e}" for e in mod.EXPECTS]
        if getattr(mod, "DEPENDS_ON", None):
            lines += ["", f"Load after: {', '.join(mod.DEPENDS_ON)}"]
        lines += ["", f"Then run `uv run bb check {mod.FOLDER}` from the etl/ folder.", ""]
        (d / "README.md").write_text("\n".join(lines))
    print(f"Folders ready under {RAW_DIR}")


def cmd_status(_args):
    for mod in sources.ALL:
        files = raw_files(mod.FOLDER)
        mark = "✓" if files else "·"
        print(f"{mark} {mod.FOLDER:<26} {mod.TITLE}")
        for f in files:
            print(f"      {f.name}  ({f.stat().st_size / 1e6:.1f} MB)")
        if not files:
            print(f"      expects: {mod.EXPECTS[0]}")


def cmd_check(args):
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_colwidth", 40)
    for mod in _pick(args.dataset):
        tables = _transform(mod)
        for table, df in (tables or {}).items():
            print(f"\n=== {table}: {len(df):,} rows")
            nulls = df.isna().mean().mul(100).round(1)
            empty = ", ".join(f"{c} {p}" for c, p in nulls.items() if p > 0)
            print(f"  % empty per column: {empty or 'none'}")
            if "geom" in df.columns:
                print(f"  rows with a location: {df['geom'].notna().sum():,} / {len(df):,}")
            print(df.head(args.rows).to_string())
        print()


def cmd_init_db(_args):
    with db.connect() as conn:
        for name in db.apply_migrations(conn):
            print(f"applied {name}")


PROJECT_TABLES = [
    "service_requests_311", "sr311_request_types", "neighbourhood_profiles",
    "neighbourhood_profile_variables", "ward_profiles", "crime_rates", "neighbourhood_population",
    "building_permits", "development_applications", "rentsafe_evaluations", "address_points",
    "neighbourhoods", "wards", "sources",
]


def cmd_reset_db(args):
    if not args.yes:
        raise SystemExit("This drops every Block Brief table and its data. Re-run with --yes to confirm.")
    with db.connect() as conn:
        conn.execute("drop table if exists " + ", ".join(PROJECT_TABLES) + " cascade")
        conn.commit()
        for name in db.apply_migrations(conn):
            print(f"dropped project tables, applied {name}")


def cmd_load(args):
    with db.connect() as conn:
        for mod in _pick(args.dataset):
            tables = _transform(mod)
            if tables is None:
                continue
            for table, df in tables.items():
                t = time.time()
                n = db.replace_table(conn, table, df)
                print(f"    loaded {n:,} rows into {table} in {time.time() - t:.1f}s")
            for sql in getattr(mod, "POST_LOAD_SQL", []):
                cur = conn.execute(sql)
                conn.commit()
                print(f"    post-load step updated {cur.rowcount:,} rows")
            if mod.FOLDER == "building_permits":
                total, located = conn.execute(
                    "select count(*), count(geom) from building_permits").fetchone()
                print(f"    permits with a location: {located:,} / {total:,}"
                      + ("  (load address_points first)" if located == 0 and total else ""))


NEAR_SQL = {
    "RentSafeTO evaluations": "select count(*) from rentsafe_evaluations where st_dwithin(geom::geography, %(p)s::geography, %(r)s)",
    "Active building permits": "select count(*) from building_permits where permit_group = 'active' and st_dwithin(geom::geography, %(p)s::geography, %(r)s)",
    "Development applications": "select count(*) from development_applications where st_dwithin(geom::geography, %(p)s::geography, %(r)s)",
}


def cmd_near(args):
    with db.connect() as conn:
        conn.execute("select set_limit(0.3)")
        hit = conn.execute(
            """select address_full, municipality, st_y(geom), st_x(geom), geom
                 from address_points
                where lower(address_full) %% lower(%(q)s)
                order by similarity(lower(address_full), lower(%(q)s)) desc
                limit 1""",
            {"q": args.address}).fetchone()
        if not hit:
            raise SystemExit(f"No address match for {args.address!r} (is address_points loaded?)")
        address, muni, lat, lon, point = hit
        print(f"Matched: {address}, {muni}  ({lat:.6f}, {lon:.6f})\n")

        p = {"p": point, "r": args.radius}
        for label, sql in NEAR_SQL.items():
            print(f"  {label} within {args.radius} m: {conn.execute(sql, p).fetchone()[0]:,}")
        hood = conn.execute("select hood_id, area_name from neighbourhoods where st_covers(geom, %(p)s)", p).fetchone()
        ward = conn.execute("select ward_number, ward_name from wards where st_covers(geom, %(p)s)", p).fetchone()
        print(f"  Neighbourhood: {hood[1]} ({hood[0]})" if hood else "  Neighbourhood: (not loaded / no match)")
        print(f"  Ward: {ward[1]} ({ward[0]})" if ward else "  Ward: (not loaded / no match)")
        if ward:
            n = conn.execute("select count(*) from service_requests_311 where ward_number = %s", (ward[0],)).fetchone()[0]
            print(f"  311 requests loaded for this ward: {n:,}")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="bb", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("folders").set_defaults(fn=cmd_folders)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("check")
    p.add_argument("dataset")
    p.add_argument("--rows", type=int, default=3)
    p.set_defaults(fn=cmd_check)
    sub.add_parser("init-db").set_defaults(fn=cmd_init_db)
    p = sub.add_parser("reset-db")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(fn=cmd_reset_db)
    p = sub.add_parser("load")
    p.add_argument("dataset")
    p.set_defaults(fn=cmd_load)
    p = sub.add_parser("near")
    p.add_argument("address")
    p.add_argument("--radius", type=int, default=500)
    p.set_defaults(fn=cmd_near)
    args = parser.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
