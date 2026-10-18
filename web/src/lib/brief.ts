import { supabase } from "./supabase";

// Shapes returned by the SQL functions in supabase/migrations/0002_brief.sql.

/** Points at the dataset row(s) a fact came from. */
export type Cite =
  | { dataset: string; file: string; row: number }
  | { dataset: string; file: string; row_count: number; sample_rows: number[] }
  | { dataset: string; file: string; row: number; total_row?: number; column_hood_id: number };

export type AddressMatch = {
  address_point_id: number;
  address: string;
  municipality: string | null;
  ward_number: number | null;
  lat: number;
  lon: number;
  similarity: number;
};

type Count = { type: string; count: number };
type LatLon = { lat: number; lon: number };
type RequestCount = Count & { still_open: number; cite: Cite };

export type Brief = {
  address: {
    address_point_id: number; address: string; municipality: string | null;
    lat: number; lon: number; radius_m: number; cite: Cite;
  };
  area: {
    neighbourhood: { hood_id: number; name: string; classification: string; cite: Cite } | null;
    ward: { ward_number: number; name: string; cite: Cite } | null;
  };
  building:
    | { in_rentsafe: false; note: string }
    | {
        in_rentsafe: true; rsn: number; site_address: string; property_type: string | null;
        year_built: number | null; storeys: number | null; units: number | null;
        latest_evaluation: {
          date: string | null; score: number | null; score_scale: string; item_scale_max: number;
          percent_of_buildings_scoring_lower: number | null;
          lowest_items: { item: string; score: number }[] | null; cite: Cite;
        };
        history: { date: string | null; score: number | null; cite: Cite }[];
      };
  rentsafe_nearby: {
    note: string;
    buildings: (LatLon & {
      rsn: number; address: string; score: number | null; evaluation_date: string | null;
      scoring: "2023+" | "pre-2023"; storeys: number | null; units: number | null;
      distance_m: number; cite: Cite;
    })[];
  };
  permits_at_address: {
    note: string;
    items: {
      permit_num: string; group: "active" | "cleared"; type: string; work: string | null;
      status: string; application_date: string | null; issued_date: string | null;
      completed_date: string | null; description: string | null; est_const_cost: number | null;
      cite: Cite;
    }[];
  };
  construction_nearby: {
    active_permit_count: number;
    by_type: Count[];
    notable_definition: string;
    notable: (LatLon & {
      permit_num: string; type: string; status: string; address: string | null; distance_m: number;
      issued_date: string | null; description: string | null; est_const_cost: number | null;
      dwelling_units_created: number | null; cite: Cite;
    })[];
    cite: Cite | null;
  };
  development_applications: {
    counts: Partial<Record<"in_review" | "approved" | "closed", number>> | null;
    type_labels: Record<string, string>;
    open: (LatLon & {
      application_number: string; type: string; status: string;
      status_group: "in_review" | "approved"; address: string | null; distance_m: number;
      /** Other street addresses the same application covers (the City lists one row per address). */
      other_addresses: string[] | null;
      date_submitted: string | null; description: string | null; url: string | null;
      community_meeting_date: string | null; cite: Cite;
    })[];
  };
  service_requests_311: {
    period: { from: string | null; to: string | null };
    nearby: {
      note: string; count: number; top_types: RequestCount[];
      points: (LatLon & { type: string; status: string; date: string; row: number })[];
    };
    ward: { ward_number: number | null; count: number; top_types: RequestCount[] };
  };
  crime: {
    year: number; note: string;
    offences: {
      offence: string; count: number; rate_per_100k: number; city_rate_per_100k: number | null;
      previous_year_rate: number | null; cite: Cite;
    }[];
  };
  /** Added by loadBrief (the page) from bb_construction_near; null if that call failed, absent elsewhere. */
  construction_near?: ConstructionNear | null;
  census: {
    source_note: string;
    values: Record<string, {
      label: string; value: number | null; of_total?: number; percent?: number;
      toronto_neighbourhood_median: number | null; compared_as: "percent" | "value"; cite: Cite;
    }> | null;
  };
};

/** Major construction and 311 noise complaints near the address (bb_construction_near, migration 0008). */
export type ConstructionNear = {
  /** How far `sites` reaches: the brief's radius, but at least 500 m. */
  within_m: number;
  definition: string;
  sites_within_250: number;
  sites_within_500: number;
  sites_within_radius: number;
  /** Nearest first, at most 300. Each is one site, described by its heaviest permit. */
  sites: (LatLon & {
    permit_num: string; type: string; status: string; address: string | null; distance_m: number;
    est_const_cost: number | null; issued_date: string | null; permits: number; cite: Cite;
  })[];
  /** 311 noise complaints within a fixed 500 m, whatever the brief's radius, grouped by intersection. */
  noise_within_m: number;
  noise_complaints: number;
  noise_corners: (LatLon & { distance_m: number; count: number; sample_rows: number[] })[];
  noise_source: { dataset: string; file: string; from: string | null; to: string | null } | null;
};

export const DEFAULT_RADIUS_M = 500;
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 1000;

// Supabase's anon role cancels statements after 3 s. A brief takes ~0.3-0.6 s, but the first
// one on a cold database connection can take longer; the retry then finds a warm cache.
const STATEMENT_TIMEOUT = "57014";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase().rpc(fn, args);
    if (!error) return data as T;
    if (error.code !== STATEMENT_TIMEOUT || attempt === 2) {
      throw new Error(`${fn} failed: ${error.message}`);
    }
  }
}

export async function geocode(query: string, maxResults = 5): Promise<AddressMatch[]> {
  return (await rpc<AddressMatch[] | null>("bb_geocode", { q: query, max_results: maxResults })) ?? [];
}

export async function getBrief(addressPointId: number, radiusM = DEFAULT_RADIUS_M): Promise<Brief | null> {
  return rpc<Brief | null>("bb_brief", { p_address_point_id: addressPointId, p_radius_m: radiusM });
}

/** Major construction sites and noise complaints around an address (supabase/migrations/0008). Only the page needs
 *  it (loadBrief attaches it to the brief); it's optional there: without it, the construction & noise score falls
 *  back to the brief's own lists. One retry, since a dropped request would otherwise cost the page its counts. */
export async function getConstructionNear(addressPointId: number, radiusM = DEFAULT_RADIUS_M): Promise<ConstructionNear | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await rpc<ConstructionNear | null>("bb_construction_near", { p_address_point_id: addressPointId, p_radius_m: radiusM });
    } catch (err) {
      if (attempt === 2) console.error(err);
    }
  }
  return null;
}

export type RentSafeStats = { median_score: number | null; buildings: number; scoring: "2023+"; note: string };

/** City-wide RentSafeTO context (median of each building's latest 2023+ evaluation). */
export async function getRentSafeStats(): Promise<RentSafeStats | null> {
  return rpc<RentSafeStats | null>("bb_rentsafe_stats", {});
}
