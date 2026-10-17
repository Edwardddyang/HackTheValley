import {
  DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M, geocode, getBrief,
} from "@/lib/brief";

// GET /api/brief?address=100 Queen St W[&radius=500]
// GET /api/brief?id=<address_point_id>[&radius=500]   (e.g. after the user picks an alternative)
//
// Returns the facts-only brief: every section comes from the database with a citation per
// fact. `summary` is reserved for the AI summary, which is not built yet.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const address = params.get("address")?.trim();
  const idParam = params.get("id");
  const radius = Number(params.get("radius") ?? DEFAULT_RADIUS_M);

  if (!address && !idParam) {
    return Response.json({ error: "Pass ?address=... or ?id=<address_point_id>." }, { status: 400 });
  }
  if (!Number.isInteger(radius) || radius < MIN_RADIUS_M || radius > MAX_RADIUS_M) {
    return Response.json(
      { error: `radius must be a whole number of metres from ${MIN_RADIUS_M} to ${MAX_RADIUS_M}.` },
      { status: 400 },
    );
  }

  try {
    let addressPointId: number;
    let alternatives: Awaited<ReturnType<typeof geocode>> = [];

    if (idParam) {
      addressPointId = Number(idParam);
      if (!Number.isInteger(addressPointId)) {
        return Response.json({ error: "id must be an address_point_id." }, { status: 400 });
      }
    } else {
      const matches = await geocode(address!);
      if (matches.length === 0) {
        return Response.json(
          { error: `No Toronto address matched "${address}". Include the street number, e.g. "100 Queen St W".` },
          { status: 404 },
        );
      }
      addressPointId = matches[0].address_point_id;
      alternatives = matches.slice(1);
    }

    const brief = await getBrief(addressPointId, radius);
    if (!brief) {
      return Response.json({ error: `No address point with id ${addressPointId}.` }, { status: 404 });
    }
    return Response.json({ query: address ?? null, alternatives, brief, summary: null });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not build the brief." }, { status: 500 });
  }
}
