// Display helpers. Labels here only rename the City's codes; they add no interpretation.

const numberFmt = new Intl.NumberFormat("en-CA");
const moneyFmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const compactMoneyFmt = new Intl.NumberFormat("en-CA", {
  style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1,
});
const dateFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", timeZone: "UTC" });

export const num = (n: number | null | undefined) => (n == null ? "—" : numberFmt.format(n));
export const money = (n: number | null | undefined) => (n == null ? "—" : moneyFmt.format(n));
export const compactMoney = (n: number | null | undefined) => (n == null ? "—" : compactMoneyFmt.format(n));
export const date = (d: string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const month = (d: string | null | undefined) => (d ? monthFmt.format(new Date(d)) : "—");
export const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${Number((m / 1000).toFixed(1))} km`);

/** "326 AVENUE RD" -> "326 Avenue Rd" (RentSafeTO, permits and applications are upper case). */
export function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** "HOT WATER" -> "Hot water" (registration fields are upper case codes). */
export function sentenceCase(s: string | null | undefined) {
  if (!s) return "";
  const lower = s.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Listing bedroom count (0 = bachelor) as words. */
export function bedroomsLabel(beds: number) {
  if (beds === 0) return "Bachelor";
  return beds === 1 ? "1 bedroom" : `${beds} bedrooms`;
}

/** Listing bedroom count -> the CMHC table column it compares with. */
export function bedroomsKey(beds: number): "studio" | "one" | "two" | "three_plus" {
  return beds <= 0 ? "studio" : beds === 1 ? "one" : beds === 2 ? "two" : "three_plus";
}

/** CMHC's label for that column, for sentences ("1-bedroom apartments"). */
export const BEDROOM_NOUN: Record<"studio" | "one" | "two" | "three_plus", string> = {
  studio: "bachelor",
  one: "1-bedroom",
  two: "2-bedroom",
  three_plus: "3-bedroom-or-larger",
};

export const OFFENCE_LABELS: Record<string, string> = {
  ASSAULT: "Assault",
  AUTOTHEFT: "Auto theft",
  BIKETHEFT: "Bicycle theft",
  BREAKENTER: "Break and enter",
  HOMICIDE: "Homicide",
  ROBBERY: "Robbery",
  SHOOTING: "Shootings",
  THEFTFROMMV: "Theft from vehicle",
  THEFTOVER: "Theft over $5,000",
};

/** Plain names for the tables a citation can point at. */
export const DATASET_NAMES: Record<string, { short: string; long: string }> = {
  address_points: { short: "Address", long: "Address Points (Municipal)" },
  wards: { short: "Wards", long: "City Wards" },
  neighbourhoods: { short: "Hoods", long: "Neighbourhoods (158 model)" },
  rentsafe_evaluations: { short: "RentSafeTO", long: "Apartment Building Evaluations (RentSafeTO)" },
  apartment_registrations: { short: "Registry", long: "Apartment Building Registration" },
  cmhc_rents: { short: "CMHC", long: "CMHC Rental Market Survey" },
  intersections: { short: "Corners", long: "Intersection File (Centreline Intersection)" },
  building_permits: { short: "Permits", long: "Building Permits" },
  development_applications: { short: "Dev apps", long: "Development Applications" },
  service_requests_311: { short: "311", long: "311 Service Requests" },
  crime_rates: { short: "TPS", long: "Neighbourhood Crime Rates (Toronto Police Service)" },
  neighbourhood_profiles: { short: "Census", long: "Neighbourhood Profiles, 2021 Census" },
  openstreetmap: { short: "OSM", long: "OpenStreetMap (essentials extract)" },
};

export const datasetName = (d: string) => DATASET_NAMES[d] ?? { short: d, long: d };
