"""Parser tests for apartment_registrations and cmhc_rents.

    cd etl && uv run python -m unittest discover -s tests -v

The tests on real files run when they are in data/raw/<dataset>/ (or BB_RAW_DIR), and are
checked against the 375 Brunswick Ave fixture the web app uses.
"""

import json
import tempfile
import unittest
from pathlib import Path

import openpyxl

from blockbrief_etl.paths import REPO_ROOT, raw_files
from blockbrief_etl.sources import apartment_registrations, cmhc_rents

FIXTURE = REPO_ROOT / "web" / "src" / "fixtures" / "extras-375-brunswick.json"

REGISTRATION_HEADER = (
    "_id,RSN,SITE_ADDRESS,YEAR_BUILT,HEATING_TYPE,HEATING_EQUIPMENT_STATUS,HEATING_EQUIPMENT_YEAR_INSTALLED,"
    "AIR_CONDITIONING_TYPE,IS_THERE_A_COOLING_ROOM,PETS_ALLOWED,PROP_MANAGEMENT_COMPANY_NAME,NO_OF_ELEVATORS,"
    "LAUNDRY_ROOM,IS_THERE_A_COOLING_ROOM?"
)


def _fixture():
    return json.loads(FIXTURE.read_text()) if FIXTURE.exists() else None


class ApartmentRegistrationsTest(unittest.TestCase):
    def _transform(self, text: str, name="apartment-building-registration-data.csv"):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / name
            path.write_text(text)
            return apartment_registrations.transform([path])["apartment_registrations"]

    def test_cleans_fields_and_reads_either_cooling_room_header(self):
        df = self._transform("\n".join([
            REGISTRATION_HEADER,
            '101,4153185,375  BRUNSWICK AVE ,1960,HOT WATER,REPLACED,2005,NONE,NO,YES,,1,YES,',
            '102,4153186,1 MAIN ST,202510,ELECTRIC,ORIGINAL,,CENTRAL AIR,,NO,NA,0,NO,YES',
            '103,4153187,2 MAIN ST,1970,,,,,,,ACME MGMT,,,',
            '104,4153185,375 BRUNSWICK AVE,1960,HOT WATER,REPLACED,2005,NONE,NO,YES,,1,YES,',
        ]) + "\n")
        rows = {r["rsn"]: r for r in df.to_dict("records")}
        self.assertEqual(len(df), 3, "duplicate rsn is dropped")
        a = rows[4153185]
        self.assertEqual(a["source_row_id"], 101)  # the City's _id
        self.assertEqual(a["site_address"], "375 BRUNSWICK AVE")
        self.assertEqual(a["air_conditioning_type"], "NONE")  # an answer, not a blank
        self.assertIs(a["has_cooling_room"], False)
        self.assertIsNone(a["property_manager"])
        b = rows[4153186]
        self.assertIsNone(b["year_built"])  # impossible year
        self.assertIs(b["has_cooling_room"], True)  # from IS_THERE_A_COOLING_ROOM?
        self.assertIsNone(b["property_manager"])  # "NA"
        self.assertIsNone(b["heating_equipment_year"])
        c = rows[4153187]
        self.assertIsNone(c["has_cooling_room"])
        self.assertIsNone(c["elevators"])
        self.assertEqual(c["property_manager"], "ACME MGMT")

    def test_only_the_question_mark_header(self):
        header = REGISTRATION_HEADER.replace("IS_THERE_A_COOLING_ROOM,", "")
        df = self._transform(header + "\n1,7,3 MAIN ST,1990,ELECTRIC,ORIGINAL,1990,NONE,YES,,2,YES,YES\n")
        self.assertIs(df.iloc[0]["has_cooling_room"], True)
        self.assertEqual(df.iloc[0]["source_row_id"], 1)

    def test_wrong_file_names_missing_columns(self):
        with self.assertRaisesRegex(ValueError, "missing expected columns"):
            self._transform("RSN,SITE_ADDRESS\n1,2 MAIN ST\n")

    def test_real_file_matches_fixture(self):
        files = raw_files(apartment_registrations.FOLDER)
        fixture = _fixture()
        if not files or not fixture:
            self.skipTest("no file in data/raw/apartment_registrations/ (or no web fixture)")
        df = apartment_registrations.transform(files)["apartment_registrations"]
        self.assertGreater(len(df), 3000)
        self.assertTrue(df["rsn"].is_unique)
        row = df[df["rsn"] == 4153185].iloc[0].to_dict()
        expected = fixture["registration"]
        for key in ("heating_type", "heating_equipment_status", "heating_equipment_year", "air_conditioning_type",
                    "has_cooling_room", "pets_allowed", "property_manager", "elevators", "laundry_room"):
            self.assertEqual(row[key], expected[key], key)


class CmhcRentsTest(unittest.TestCase):
    def test_rent_values(self):
        self.assertEqual(cmhc_rents._rent("1,606"), 1606)
        self.assertEqual(cmhc_rents._rent("1790"), 1790)
        self.assertEqual(cmhc_rents._rent(1713.4), 1713)
        self.assertIsNone(cmhc_rents._rent("**"))
        self.assertIsNone(cmhc_rents._rent(None))
        self.assertEqual(cmhc_rents._reliability(" b "), "b")
        self.assertIsNone(cmhc_rents._reliability("**"))

    def test_missing_sheet(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "rmr-toronto-2025-en.xlsx"
            wb = openpyxl.Workbook()
            wb.active.title = "Table 1.1.2"
            wb.save(path)
            with self.assertRaisesRegex(ValueError, "Table 1.1.9"):
                cmhc_rents.transform([path])

    def test_real_file_matches_fixture(self):
        files = raw_files(cmhc_rents.FOLDER)
        fixture = _fixture()
        if not files or not fixture:
            self.skipTest("no file in data/raw/cmhc_rents/ (or no web fixture)")
        df = cmhc_rents.transform(files)["cmhc_rents"]
        self.assertEqual(len(df), 22 * 5)
        self.assertEqual(set(df["survey_year"]), {2025})
        self.assertEqual(set(df["municipality"].dropna()), set(cmhc_rents.MUNICIPALITY_AREAS))
        expected = fixture["rent_benchmark"]
        area = df[df["area"] == expected["area"]]
        self.assertEqual(set(area["source_row_id"]), {expected["cite"]["row"]})
        for bedrooms, values in expected["by_bedrooms"].items():
            row = area[area["bedrooms"] == bedrooms].iloc[0]
            self.assertEqual(row["vacant_unit_rent"], values["vacant_units"], bedrooms)
            self.assertEqual(row["average_rent"], values["all_units"], bedrooms)


if __name__ == "__main__":
    unittest.main()
