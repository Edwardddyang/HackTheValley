/** Great-circle distance in metres between two points (haversine, mean Earth radius). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The City often records one address twice: a point for the lot and one for the building entrance, metres apart
 *  (96 Churchill Ave). Keeps the first of each address + municipality within `withinM`, in the given order; the
 *  same address farther apart is a different place and stays. */
export function mergeNearbyDuplicates<T extends { address: string; municipality: string | null; lat: number; lon: number }>(
  matches: T[], withinM = 100,
): T[] {
  const kept: T[] = [];
  for (const m of matches) {
    const same = kept.some((k) => k.address.toLowerCase() === m.address.toLowerCase() && k.municipality === m.municipality
      && distanceM(k.lat, k.lon, m.lat, m.lon) <= withinM);
    if (!same) kept.push(m);
  }
  return kept;
}
