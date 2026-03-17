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
  const candidate = segments[segments.length - 2];
  return isVersion(candidate) ? candidate : null;
}

/**
 * A pre-release pattern with its per-GA retain count.
 * Cleanup keeps the `retain` most-recent versions matching this pattern
 * for each group/artifact coordinate, deleting the rest.
 */
export interface PrereleasePattern {
  pattern: RegExp;
  retain: number;
}

/**
 * Patterns that qualify a version as pre-release.
 * Cleanup only expires versions matching one of these patterns.
 * Releases (no match) are immutable and retained forever.
 *
 * Each pattern is tested against the hyphen-qualifier portion of the version
 * (everything after the first `-`). Add new entries as needed, e.g.:
 *
 *   { pattern: /^pr\.\d+$/, retain: 5 }   — keep 5 most recent PR builds
 *   { pattern: /^beta\.\d+$/, retain: 3 }  — keep 3 most recent betas
 *   { pattern: /^rc\.\d+$/, retain: 3 }    — keep 3 most recent RCs
 */
export const PRERELEASE_PATTERNS: PrereleasePattern[] = [];

/**
 * Returns the matching {@link PrereleasePattern} entry for a version,
 * or `null` if the version is not pre-release.
 */
export function matchingPattern(version: string): PrereleasePattern | null {
  const hyphenIndex = version.indexOf("-");
  if (hyphenIndex === -1) return null;
  const qualifier = version.slice(hyphenIndex + 1);
  return PRERELEASE_PATTERNS.find((p) => p.pattern.test(qualifier)) ?? null;
}

/**
 * A version is pre-release if its hyphen qualifier matches one of the
 * configured {@link PRERELEASE_PATTERNS}. Bare numeric versions and
 * versions with unrecognized qualifiers are treated as releases.
 */
export function isPrerelease(version: string): boolean {
  return matchingPattern(version) !== null;
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
