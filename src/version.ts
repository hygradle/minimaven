/**
 * Extract the version segment from a Maven repository path.
 *
 * Standard layout: `{group...}/{artifactId}/{version}/{filename}`
 * The version is the third-to-last segment.
 *
 * Returns `null` for paths that don't contain a version segment
 * (e.g., GA-level `maven-metadata.xml`).
 */
export function extractVersion(mavenPath: string): string | null {
  const segments = mavenPath.split("/").filter(Boolean);
  // Need at least: groupId / artifactId / version / filename
  if (segments.length < 4) return null;
  return segments[segments.length - 2];
}

/**
 * A version is pre-release if it contains a hyphen qualifier
 * (e.g., `1.2.3-pr.42`, `1.0.0-beta.1`).
 * Bare numeric versions (`1.2.3`, `2.0`) are releases.
 */
export function isPrerelease(version: string): boolean {
  return version.includes("-");
}

/**
 * Returns true if the string looks like a Maven version
 * (starts with a digit). Artifact IDs never start with digits.
 */
export function isVersion(s: string): boolean {
  return s.length > 0 && s.charCodeAt(0) >= 48 && s.charCodeAt(0) <= 57;
}

/**
 * Compare two dot-separated numeric version strings.
 * Returns negative if a < b, zero if equal, positive if a > b.
 * Handles unequal segment counts (missing segments treated as 0).
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
