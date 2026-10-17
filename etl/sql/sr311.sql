-- 311 service requests, Jan 2025 to the latest monthly refresh, as monthly counts per postal area (FSA),
-- ward and request type (~930k requests -> ~280k rows).
-- Source: Toronto Open Data "311-service-requests-customer-initiated". Pre-aggregated in etl/load.mjs.
-- The City publishes no per-address location and no closed date: show "in M5A" or "in Ward 13", never
-- "at this building", and never resolution times.
create table if not exists public.sr311_monthly (
  month date not null,
  fsa text,                          -- null when the request was located by intersection
  ward_number int,
  service_request_type text not null,
  division text,
  category text,                     -- heat | building | noise | waste | graffiti | water | null (not renter-relevant)
  requests int not null,
  open_requests int not null
);
create index if not exists sr311_monthly_fsa_idx on public.sr311_monthly (fsa, month);
create index if not exists sr311_monthly_ward_idx on public.sr311_monthly (ward_number, month);

truncate public.sr311_monthly;
insert into public.sr311_monthly
select
  (month || '-01')::date,
  raw.txt(fsa),
  raw.num(ward)::int,
  service_request_type,
  raw.txt(division),
  -- Type names change between years (2025 "Amplified Sound or Instrument Sound" = 2026 "...Noise"),
  -- so match on both. Checked against the 2025 and 2026 type lists on 2026-10-17.
  case
    when service_request_type in ('Adequate Heat', 'Excessive Heat in a Rental Unit') then 'heat'
    when service_request_type in (
      'Property Standards and Maintenance Violations', 'Multi-Tenant Houses Licensing and Violations',
      'Waste Storage on a Multi-residential / Commercial Property'
    ) then 'building'
    when service_request_type ilike '%noise%' or service_request_type ilike '%instrument sound%' then 'noise'
    when (service_request_type ilike '%dumping%' and service_request_type not ilike '%snow%')
      or service_request_type ilike 'Multi-res%not picked up%' then 'waste'
    when service_request_type ilike '%graffiti%' then 'graffiti'
    when service_request_type in (
      'Water Service Line-No Water', 'Water Quality-Discoloured (Rusty or dirty) Water'
    ) then 'water'
  end,
  raw.num(requests)::int,
  raw.num(open_requests)::int
from raw.sr311;

select raw.enable_public_read('public.sr311_monthly');
