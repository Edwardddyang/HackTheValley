// Shared contract between the data layer (Edward), the AI layer (Ariaz) and the UI (Satwik).
// Owner: Ariaz. Change it only through a PR. src/fixtures/sample-report.json must always match it.
//
// Every fact shown to the user carries a SourceRef so the UI can render a citation chip and the AI
// brief can only cite rows that were actually retrieved.

export type Dataset =
  | "buildings"
  | "building_evaluations"
  | "dev_applications"
  | "building_permits"
  | "sr311_monthly"
  | "parks_rec"
  | "libraries"
  | "wards"
  | "address_points"
  | "cmhc";

/** "building_evaluations:5123". Stable across the page; the AI cites these strings verbatim. */
export type SourceId = `${Dataset}:${string}`;

export type LatLng = { lat: number; lng: number };

/** One address-search result (autocomplete row). */
export type AddressMatch = {
  label: string; // "326 AVENUE RD"
  location: LatLng;
  /** RentSafeTO building id; null when the address is not a registered apartment building (3+ storeys, 10+ units). */
  rsn: number | null;
  addressPointId: number | null;
};

/** One RentSafeTO inspection item, scored 1 (worst) to 3 (best). */
export type InspectionItem = { key: string; label: string; score: 1 | 2 | 3 };

export type RentControl = "likely-controlled" | "likely-exempt" | "unknown";

export type BuildingCard = {
  rsn: number;
  address: string;
  yearBuilt: number | null;
  storeys: number | null;
  units: number | null;
  propertyType: string | null; // PRIVATE, TCHC, SOCIAL HOUSING
  propertyManager: string | null;
  /** Built (first occupied) after 2018-11-15 means likely exempt from rent-increase limits; confirm with the landlord. */
  rentControl: RentControl;
  heating: { type: string | null; equipmentStatus: string | null; equipmentYear: number | null };
  cooling: { airConditioning: string | null; coolingRoom: boolean | null };
  petsAllowed: string | null;
  evaluation: {
    score: number; // 0-100, weighted
    evaluatedOn: string; // ISO date
    cityMedianScore: number;
    weakest: InspectionItem[]; // lowest-scored items, worst first
    items: InspectionItem[];
    source: SourceId;
  } | null;
  source: SourceId;
};

export type NearbyChange = {
  kind: "development_application" | "building_permit";
  title: string; // address
  description: string;
  status: string;
  date: string | null; // submitted (applications) or issued (permits), ISO date
  distanceM: number;
  location: LatLng;
  url: string | null;
  communityMeeting: { date: string; time: string | null; location: string | null } | null;
  unitsCreated: number | null;
  source: SourceId;
};

export type ComplaintCategory = "heat" | "building" | "noise" | "waste" | "graffiti" | "water";

/** 311 is only located to a postal area (FSA) or ward: never present these as "at this building". */
export type AreaComplaints = {
  fsa: string | null;
  wardNumber: number;
  since: string; // first month counted, "2025-10"
  byCategory: {
    category: ComplaintCategory;
    fsaCount: number | null;
    wardCount: number;
    cityMedianFsaCount: number | null; // context for "is this a lot?"
    source: SourceId;
  }[];
};

export type RentBenchmark = {
  zone: string; // CMHC survey zone
  surveyYear: number;
  averageRent: { bachelor: number | null; oneBed: number | null; twoBed: number | null; threePlusBed: number | null };
  source: SourceId;
};

export type Amenity = {
  kind: "park" | "rec_centre" | "library" | "grocery" | "pharmacy" | "transit";
  name: string;
  distanceM: number;
  location: LatLng;
  url: string | null;
  source: SourceId;
};

export type WardPanel = {
  wardNumber: number;
  wardName: string;
  renterShare: number | null; // 0-1, 2021 Census
  averageRentSafeScore: number | null;
  buildingsEvaluated: number;
  candidatesUrl: string; // the City's official 2026 candidate list; we never rank or recommend candidates
  questions: string[]; // neutral questions any renter could ask any candidate
  source: SourceId;
};

/**
 * What Gemini read out of a pasted rental listing (text or screenshot). The user supplies the listing;
 * we never fetch or scrape listing sites. Fields are null when the listing doesn't say.
 */
export type ListingExtraction = {
  address: string | null; // as written in the listing; resolved through address search
  unit: string | null;
  askingRent: number | null; // CAD per month
  bedrooms: number | null; // 0 = bachelor
  utilitiesIncluded: string | null;
  availableFrom: string | null; // ISO date
  confidence: "high" | "medium" | "low"; // low means: ask the user to confirm the address
};

/** Gemini output. Every sentence cites at least one SourceId that appears elsewhere in the report. */
export type Brief = {
  sentences: { text: string; sources: SourceId[] }[];
  checklist: { question: string; sources: SourceId[] }[];
  model: string;
  generatedAt: string;
};

export type BuildingReport = {
  query: AddressMatch;
  listing: ListingExtraction | null; // set when the report started from a pasted listing
  building: BuildingCard | null; // null for houses, condos and small buildings outside RentSafeTO
  nearby: NearbyChange[]; // within 500 m, nearest first
  area: AreaComplaints;
  rent: RentBenchmark | null;
  amenities: Amenity[];
  ward: WardPanel;
  brief: Brief | null; // loaded separately from /api/brief
  limitations: string[];
  generatedAt: string;
};
