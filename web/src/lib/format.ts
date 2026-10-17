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
export const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** "326 AVENUE RD" -> "326 Avenue Rd" (RentSafeTO, permits and applications are upper case). */
export function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

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
  building_permits: { short: "Permits", long: "Building Permits" },
  development_applications: { short: "Dev apps", long: "Development Applications" },
  service_requests_311: { short: "311", long: "311 Service Requests" },
  crime_rates: { short: "TPS", long: "Neighbourhood Crime Rates (Toronto Police Service)" },
  neighbourhood_profiles: { short: "Census", long: "Neighbourhood Profiles, 2021 Census" },
};

export const datasetName = (d: string) => DATASET_NAMES[d] ?? { short: d, long: d };
