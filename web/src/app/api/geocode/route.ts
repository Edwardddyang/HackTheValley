import { geocode } from "@/lib/brief";

// GET /api/geocode?q=100 queen st w   -> up to 5 matching Toronto addresses (for autocomplete)
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return Response.json({ matches: [] });
  }
  try {
    return Response.json({ matches: await geocode(q) });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Address lookup failed." }, { status: 500 });
  }
}
