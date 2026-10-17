import { supabase } from "./supabase";
import type { Cite } from "./brief";

// Facts the brief doesn't carry yet, from bb_extras() in supabase/migrations/0003_extras.sql:
// the building's City registration (heating, cooling, manager) and CMHC area rents.

export type Bedrooms = "studio" | "one" | "two" | "three_plus";

export type Extras = {
  /** Apartment Building Registration for the RentSafeTO building at this address; null for other addresses. */
  registration: {
    rsn: number;
    heating_type: string | null;
    heating_equipment_status: string | null;
    heating_equipment_year: number | null;
    air_conditioning_type: string | null;
    has_cooling_room: boolean | null;
    pets_allowed: string | null;
    property_manager: string | null;
    elevators: number | null;
    laundry_room: string | null;
    cite: Cite;
  } | null;
  /** CMHC Rental Market Survey (October) for the address's former municipality; null when not loaded. */
  rent_benchmark: {
    area: string;
    survey: string;
    survey_year: number;
    /** vacant_units: units vacant at survey time, the closest public figure to a new lease. all_units: every occupied unit, including long-time tenants. */
    by_bedrooms: Record<Bedrooms, { vacant_units: number | null; all_units: number | null }>;
    note: string;
    cite: Cite;
  } | null;
};

const NOT_DEPLOYED = new Set(["PGRST202", "42883"]); // function not found (PostgREST / Postgres)

/** Null (not an error) when bb_extras hasn't been deployed yet, so the page still renders the brief. */
export async function getExtras(addressPointId: number): Promise<Extras | null> {
  const { data, error } = await supabase().rpc("bb_extras", { p_address_point_id: addressPointId });
  if (error) {
    if (NOT_DEPLOYED.has(error.code)) return null;
    throw new Error(`bb_extras failed: ${error.message}`);
  }
  return (data as Extras | null) ?? null;
}
