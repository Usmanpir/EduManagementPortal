/**
 * Matches people by name: every word typed must appear in the first or last
 * name, so "Abdullah Ali", "ali abdullah" and "Abdul" all find Abdullah Ali.
 */
export function nameMatch(q: string) {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: words.map((w) => ({
      OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }],
    })),
  };
}
