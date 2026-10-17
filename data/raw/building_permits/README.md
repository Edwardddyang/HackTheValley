# Building Permits (active + cleared)

Download from: https://open.toronto.ca/dataset/building-permits-active-permits/

Put these file(s) in this folder, unchanged:

- 'building-permits-active-permits.csv' from the Active Permits page above (~70 MB)
- 'Cleared Building Permits since 2017.csv' from https://open.toronto.ca/dataset/building-permits-cleared-permits/ (downloads as cleared-building-permits-since-2017.csv, ~150 MB)
- The file name must contain 'active' or 'cleared' so the loader can tell them apart.

Load after: address_points

Then run `uv run bb check building_permits` from the etl/ folder.
