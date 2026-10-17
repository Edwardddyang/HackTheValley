import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# BB_RAW_DIR lets you point at another copy of the files (e.g. a test set)
RAW_DIR = Path(os.environ.get("BB_RAW_DIR", REPO_ROOT / "data" / "raw"))
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
ENV_FILE = REPO_ROOT / ".env"

IGNORED_NAMES = {"README.md", ".gitkeep", ".DS_Store"}


def raw_files(folder: str) -> list[Path]:
    """Data files the user dropped into data/raw/<folder>/ (sorted, READMEs skipped)."""
    d = RAW_DIR / folder
    if not d.is_dir():
        return []
    return sorted(p for p in d.iterdir() if p.is_file() and p.name not in IGNORED_NAMES)
