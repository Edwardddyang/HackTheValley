// What each dataset is, what the brief uses it for, and its limits, in plain language.
// Keys match the `dataset` field of a Cite, so a source tag can link to its dataset page.

export const CITY_LICENCE = {
  name: "Open Government Licence – Toronto",
  url: "https://open.toronto.ca/open-data-licence/",
};

export type DatasetInfo = {
  key: string;
  name: string;
  publisher: string;
  url: string;
  licence: { name: string; url: string | null };
  usedFor: string;
  limits: string[];
};

const openData = (id: string) => `https://open.toronto.ca/dataset/${id}/`;

export const DATASETS: DatasetInfo[] = [
  {
    key: "rentsafe_evaluations",
    name: "Apartment Building Evaluations (RentSafeTO)",
    publisher: "City of Toronto, Municipal Licensing & Standards",
    url: openData("apartment-building-evaluation"),
    licence: CITY_LICENCE,
    usedFor:
      "The building's score out of 100, the date of each evaluation, the items inspectors graded lowest, and the share of evaluated buildings that score lower. Also the year built, storeys and units, and the scores of evaluated buildings nearby. We compare the score with the city median of 92.",
    limits: [
      "Only covers apartment buildings with 3 or more storeys and 10 or more units, so condos, basement units and houses aren't included.",
      "Inspectors look at shared spaces, the outside of the building and its records, not the inside of your unit.",
      "A score is a snapshot from the day of the evaluation. Repairs made since then won't show until the next one.",
      "Evaluations before 2023 used a different scoring system, so older scores aren't directly comparable with newer ones.",
    ],
  },
  {
    key: "apartment_registrations",
    name: "Apartment Building Registration",
    publisher: "City of Toronto, Municipal Licensing & Standards",
    url: openData("apartment-building-registration"),
    licence: CITY_LICENCE,
    usedFor: "Heating type and the age of the heating equipment, air conditioning, whether there's a cooling room, pets, elevators, laundry and the property manager.",
    limits: [
      "Landlords fill in the registration themselves, and some fields are often blank or out of date.",
      "It covers the same buildings as RentSafeTO (3+ storeys, 10+ units), and nothing else.",
    ],
  },
  {
    key: "cmhc_rents",
    name: "CMHC Rental Market Survey",
    publisher: "Canada Mortgage and Housing Corporation",
    url: "https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables",
    licence: { name: "CMHC's own terms of use (this is not City of Toronto data)", url: null },
    usedFor:
      "October 2025 rents by bedroom count for the address's former municipality: what units that were vacant at survey time rented for, and the average across all units. A pasted listing's asking rent is compared with the vacant-unit figure.",
    limits: [
      "Covers purpose-built rental apartments only; condos and basement units rent differently.",
      "Matched to the former municipality (for example the former City of Toronto), an area far bigger than one block.",
      "The all-units average includes long-time tenants on controlled rents, so it runs below what a new lease costs.",
      "The survey is yearly, taken in October.",
    ],
  },
  {
    key: "building_permits",
    name: "Building Permits (active, and cleared since 2025)",
    publisher: "City of Toronto, Toronto Building",
    url: openData("building-permits-active-permits"),
    licence: CITY_LICENCE,
    usedFor:
      "Open permits around the address, counted by type, with major projects (new buildings, demolitions, or $1 million or more) listed and mapped. Also permits at the exact address, including ones completed since January 2025.",
    limits: [
      "Permits have no coordinates. They are placed through their address point, so a few can't be mapped.",
      "\"Active\" means the permit is still open. Some were issued years ago and the work may be long finished.",
      "Cleared permits completed before 2025 aren't loaded, to fit the database's storage limit.",
    ],
  },
  {
    key: "development_applications",
    name: "Development Applications",
    publisher: "City of Toronto, City Planning",
    url: openData("development-applications"),
    licence: CITY_LICENCE,
    usedFor: "Rezonings, site plans, condominiums and subdivisions near the address, with their status, community meeting dates and a link to the City's application page.",
    limits: [
      "An application isn't an approval. Many change, stall or are withdrawn.",
      "Each application is mapped at the nearest of its street addresses, even when the site is larger.",
    ],
  },
  {
    key: "service_requests_311",
    name: "311 Service Requests – Customer Initiated",
    publisher: "City of Toronto, 311 Toronto",
    url: openData("311-service-requests-customer-initiated"),
    licence: CITY_LICENCE,
    usedFor: "Counts of requests by type: those reported at street intersections near the address (also on the map), and every request in the ward.",
    limits: [
      "311 locates requests only to a postal area or a street intersection, never to an address. Counts describe the area, never a building.",
      "Requests reported by postal code have no point, so the nearby count only includes the ones reported at an intersection.",
      "The data has no closed date, so it can't show how quickly the City responded.",
      "Counts reflect who calls 311 as well as what happens. Only one year is loaded.",
    ],
  },
  {
    key: "intersections",
    name: "Intersection File (Centreline Intersection)",
    publisher: "City of Toronto, Transportation Services",
    url: openData("intersection-file-city-of-toronto"),
    licence: CITY_LICENCE,
    usedFor: "Placing 311 requests reported at a corner on that intersection, when the two street names identify exactly one.",
    limits: ["Requests whose street names match more than one intersection, or none, can't be placed."],
  },
  {
    key: "crime_rates",
    name: "Neighbourhood Crime Rates",
    publisher: "Toronto Police Service, published on Toronto Open Data",
    url: openData("neighbourhood-crime-rates"),
    licence: CITY_LICENCE,
    usedFor: "Yearly incidents and rates per 100,000 people for the address's neighbourhood, next to the rate for all of Toronto and the year before.",
    limits: [
      "Rates are for the whole neighbourhood, not the street or the building.",
      "They count reported incidents only, and a neighbourhood's population changes the rate as much as its incidents do.",
    ],
  },
  {
    key: "neighbourhood_profiles",
    name: "Neighbourhood Profiles, 2021 Census",
    publisher: "City of Toronto, from Statistics Canada's 2021 Census",
    url: openData("neighbourhood-profiles"),
    licence: CITY_LICENCE,
    usedFor: "Renters' shelter costs, share of households that rent, housing affordability, income, building types, dwelling condition and commuting, each next to the median of Toronto's 158 neighbourhoods.",
    limits: ["Figures are from 2021 (incomes from 2020), so rents and incomes have moved since.", "They describe the whole neighbourhood, not the building."],
  },
  {
    key: "neighbourhoods",
    name: "Neighbourhoods (158 model)",
    publisher: "City of Toronto",
    url: openData("neighbourhoods"),
    licence: CITY_LICENCE,
    usedFor: "Which of Toronto's 158 neighbourhoods the address is in, which picks the crime and Census figures.",
    limits: ["Neighbourhood boundaries are administrative and can split what people think of as one area."],
  },
  {
    key: "wards",
    name: "City Wards (25-ward model)",
    publisher: "City of Toronto",
    url: openData("city-wards"),
    licence: CITY_LICENCE,
    usedFor: "Which of the 25 wards the address is in, for the ward-wide 311 counts.",
    limits: ["Wards are large; ward totals say little about any one block."],
  },
  {
    key: "ward_profiles",
    name: "Ward Profiles, 2021 Census",
    publisher: "City of Toronto, from Statistics Canada's 2021 Census",
    url: openData("ward-profiles-25-ward-model"),
    licence: CITY_LICENCE,
    usedFor: "Loaded for ward-level context. The brief doesn't show it yet.",
    limits: ["Figures are from 2021."],
  },
  {
    key: "address_points",
    name: "Address Points (Municipal) – Toronto One Address Repository",
    publisher: "City of Toronto",
    url: openData("address-points-municipal-toronto-one-address-repository"),
    licence: CITY_LICENCE,
    usedFor: "Address search and autocomplete, the point the brief is centred on, and placing building permits on the map.",
    limits: ["Unit numbers aren't separate address points, so the brief is about the building, not your unit."],
  },
];
