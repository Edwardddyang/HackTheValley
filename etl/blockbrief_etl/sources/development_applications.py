import pandas as pd

from .. import clean
from ._common import read_csv, require_columns, row_ids

FOLDER = "development_applications"
TITLE = "Development Applications"
DATASET_URL = "https://open.toronto.ca/dataset/development-applications/"
EXPECTS = ["'Development Applications.csv' (downloads as development-applications.csv)"]

# Staff contact name/phone/email columns exist in the file but are not loaded.
COLUMNS = ["APPLICATION_TYPE", "APPLICATION#", "STREET_NUM", "STREET_NAME", "STREET_TYPE",
           "STREET_DIRECTION", "POSTAL", "DATE_SUBMITTED", "STATUS", "X", "Y", "DESCRIPTION",
           "REFERENCE_FILE#", "FOLDERRSN", "WARD_NUMBER", "WARD_NAME", "COMMUNITY_MEETING_DATE",
           "COMMUNITY_MEETING_TIME", "COMMUNITY_MEETING_LOCATION", "APPLICATION_URL",
           "PARENT_FOLDER_NUMBER"]


def transform(files):
    frames = []
    for path in files:
        df = read_csv(path)
        require_columns(df, COLUMNS, path)
        frames.append(pd.DataFrame({
            "source_file": path.name,
            "source_row_id": row_ids(df),
            "application_number": clean.text(df["APPLICATION#"]),
            "application_type": clean.text(df["APPLICATION_TYPE"]),
            "street_address": clean.street_address(df),
            "postal_fsa": clean.text(df["POSTAL"]),
            "date_submitted": clean.date(df["DATE_SUBMITTED"]),
            "status": clean.text(df["STATUS"]),
            "description": clean.text(df["DESCRIPTION"]),
            "reference_file": clean.text(df["REFERENCE_FILE#"]),
            "folder_rsn": clean.text(df["FOLDERRSN"]),
            "parent_folder_number": clean.text(df["PARENT_FOLDER_NUMBER"]),
            "ward_number": clean.integer(df["WARD_NUMBER"]),
            "ward_name": clean.text(df["WARD_NAME"]),
            "community_meeting_date": clean.date(df["COMMUNITY_MEETING_DATE"]),
            "community_meeting_time": clean.text(df["COMMUNITY_MEETING_TIME"]),
            "community_meeting_location": clean.text(df["COMMUNITY_MEETING_LOCATION"]),
            "application_url": clean.text(df["APPLICATION_URL"]),
            "geom": clean.city_xy_to_ewkt(df["X"], df["Y"]),
        }))
    return {"development_applications": pd.concat(frames, ignore_index=True)}
