# 311 Service Requests - Customer Initiated

Download from: https://open.toronto.ca/dataset/311-service-requests-customer-initiated/

Put these file(s) in this folder, unchanged:

- ONE yearly file only, e.g. SR2026.zip (the .zip as downloaded, or the CSV inside it).
- Each year is ~430k-500k rows; one year keeps the Supabase free tier comfortable.

Load after: intersections

Then run `uv run bb check service_requests_311` from the etl/ folder.
