import type { AddressMatch, Amenity, BuildingReport, LatLng, NearbyChange } from "@/contracts/types";

/** Switch only after the backend team confirms endpoints and response formats.
 * Adapters must validate backend JSON against the shared contracts, handle HTTP
 * errors, and forward the AbortSignal. No endpoint paths are assumed here.
 */
type ApiAdapters = {
  searchAddresses: (query: string, signal?: AbortSignal) => Promise<AddressMatch[]>;
  getBuildingReport: (id: string, signal?: AbortSignal) => Promise<BuildingReport | null>;
  getNearbyPermits: (lat: number, lng: number, radius: number, signal?: AbortSignal) => Promise<NearbyChange[]>;
  getNearbyAmenities: (lat: number, lng: number, radius: number, signal?: AbortSignal) => Promise<Amenity[]>;
};

export const apiConfig: { mode: "mock" | "api"; adapters: Partial<ApiAdapters> } = {
  mode: "mock",
  adapters: {},
};

export function isDemoMode() { return apiConfig.mode === "mock"; }

function adapter<K extends keyof ApiAdapters>(key: K): ApiAdapters[K] {
  const implementation = apiConfig.adapters[key];
  if (!implementation) throw new Error("API mode is unconfigured. Confirm backend endpoints and response formats before connecting. No demo data was substituted.");
  return implementation;
}

// Temporary Person B fixtures. Replace with Daniel's typed mockData exports once
// available; do not modify his file. Every row below is fictional, including IDs.
const demoLocations: { address: string; location: LatLng }[] = [
  { address: "101 Example Lane — fictional", location: { lat: 43.665, lng: -79.385 } },
  { address: "202 Sample Avenue — fictional", location: { lat: 43.678, lng: -79.413 } },
  { address: "303 Illustration Road — fictional", location: { lat: 43.655, lng: -79.454 } },
  { address: "404 Demo Court — fictional", location: { lat: 43.672, lng: -79.332 } },
  { address: "505 Placeholder Street — fictional", location: { lat: 43.708, lng: -79.398 } },
];

const demoReports: BuildingReport[] = demoLocations.map(({ address, location }, index) => {
  const rsn = 990001 + index;
  const source = `demo-${rsn}`;
  const nearbyLocation = (north: number, east: number): LatLng => ({ lat: location.lat + north, lng: location.lng + east });
  return {
    query: { label: address, location, rsn, addressPointId: 990101 + index },
    listing: null,
    building: {
      rsn, address, yearBuilt: 1970 + index * 10, storeys: 6 + index * 2, units: 48 + index * 20,
      propertyType: "Fictional demonstration apartment", propertyManager: "Example Management (fictional)",
      rentControl: "unknown", heating: { type: "Sample central heating", equipmentStatus: "Illustrative", equipmentYear: 2010 + index },
      cooling: { airConditioning: "Sample shared cooling", coolingRoom: true }, petsAllowed: "Confirm with landlord",
      evaluation: {
        score: 72 + index * 4, cityMedianScore: 80, evaluatedOn: "2026-01-15",
        weakest: [{ key: "demo-maintenance", label: "Sample maintenance item", score: 2 }],
        items: [{ key: "demo-maintenance", label: "Sample maintenance item", score: 2 }],
        source: `building_evaluations:${source}`,
      },
      source: `buildings:${source}`,
    },
    nearby: [
      { kind: "building_permit", title: "Fictional renovation", description: "Illustrative permit for testing map layers.", status: "Sample issued", date: "2026-01-10", distanceM: 111, location: nearbyLocation(0.001, 0), url: null, communityMeeting: null, unitsCreated: null, source: `building_permits:${source}` },
      { kind: "development_application", title: "Fictional housing proposal", description: "Illustrative application, not an actual project.", status: "Sample under review", date: "2026-01-12", distanceM: 222, location: nearbyLocation(0.002, 0), url: null, communityMeeting: null, unitsCreated: 60, source: `dev_applications:${source}` },
    ],
    amenities: [
      { kind: "park", name: "Example Park (fictional)", distanceM: 111, location: nearbyLocation(-0.001, 0), url: null, source: `parks_rec:${source}` },
      { kind: "library", name: "Example Library (fictional)", distanceM: 222, location: nearbyLocation(-0.002, 0), url: null, source: `libraries:${source}` },
      // The contract has no transit dataset; address_points identifies this demo location only.
      { kind: "transit", name: "Example transit stop (fictional)", distanceM: 333, location: nearbyLocation(-0.003, 0), url: null, source: `address_points:${source}-transit` },
    ],
    area: { fsa: null, wardNumber: index + 1, since: "2026-01", byCategory: [{ category: "heat", fsaCount: null, wardCount: 12 + index, cityMedianFsaCount: null, source: `sr311_monthly:${source}` }] },
    rent: { zone: "Fictional survey zone", surveyYear: 2025, averageRent: { bachelor: 1400 + index * 50, oneBed: 1800 + index * 50, twoBed: 2300 + index * 50, threePlusBed: null }, source: `cmhc:${source}` },
    ward: { wardNumber: index + 1, wardName: `Illustrative ward ${index + 1}`, renterShare: 0.5 + index * 0.03, averageRentSafeScore: 80, buildingsEvaluated: 40 + index, candidatesUrl: "", questions: ["How would you support renters in this ward?"], source: `wards:${source}` },
    brief: null,
    limitations: [
      "All buildings, scores, locations, permits, amenities and ward statistics in this demo are fictional. Source IDs are placeholders, not municipal citations.",
      "311 data describes postal areas or wards, never complaints at an individual building.",
      "RentSafeTO coverage is limited to buildings with three or more storeys and ten or more units.",
      "Sample data: rent figures are illustrative. Rent-control status requires confirmation of first occupancy.",
    ],
    generatedAt: "2026-01-15T12:00:00.000Z",
  };
});

export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressMatch[]> {
  signal?.throwIfAborted();
  if (!isDemoMode()) return adapter("searchAddresses")(query, signal);
  const normalized = query.trim().toLowerCase();
  return demoReports.filter((report) => report.query.label.toLowerCase().includes(normalized)).map((report) => structuredClone(report.query));
}

export async function getBuildingReport(id: string, signal?: AbortSignal): Promise<BuildingReport | null> {
  signal?.throwIfAborted();
  if (!isDemoMode()) return adapter("getBuildingReport")(id, signal);
  return structuredClone(demoReports.find((report) => String(report.query.rsn) === id) ?? null);
}

function distanceM(a: LatLng, b: LatLng): number {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export async function getNearbyPermits(lat: number, lng: number, radius: number, signal?: AbortSignal): Promise<NearbyChange[]> {
  signal?.throwIfAborted();
  if (!isDemoMode()) return adapter("getNearbyPermits")(lat, lng, radius, signal);
  return structuredClone(demoReports.flatMap((report) => report.nearby).map((item) => ({ ...item, distanceM: Math.round(distanceM({ lat, lng }, item.location)) })).filter((item) => item.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM));
}

export async function getNearbyAmenities(lat: number, lng: number, radius: number, signal?: AbortSignal): Promise<Amenity[]> {
  signal?.throwIfAborted();
  if (!isDemoMode()) return adapter("getNearbyAmenities")(lat, lng, radius, signal);
  return structuredClone(demoReports.flatMap((report) => report.amenities).map((item) => ({ ...item, distanceM: Math.round(distanceM({ lat, lng }, item.location)) })).filter((item) => item.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM));
}
