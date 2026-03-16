import {
  extractVersion,
  matchingPattern,
  PRERELEASE_PATTERNS,
} from "../version";

/**
 * Per-version aggregation: all R2 keys belonging to one version,
 * plus the most recent upload timestamp across those keys.
 */
interface VersionEntry {
  uploadedAt: number;
  keys: string[];
}

export async function handleCleanup(env: Env): Promise<void> {
  if (PRERELEASE_PATTERNS.length === 0) {
    console.log("Cleanup: no pre-release patterns configured, nothing to do");
    return;
  }

  // Map<gaPrefix, Map<patternIndex, Map<version, VersionEntry>>>
  const groups = new Map<
    string,
    Map<number, Map<string, VersionEntry>>
  >();

  // 1. Full bucket scan — collect all pre-release objects
  let cursor: string | undefined;

  do {
    const listed = await env.ARTIFACTS.list({
      cursor,
      include: ["customMetadata"],
    });

    for (const obj of listed.objects) {
      if (obj.customMetadata?.prerelease !== "true") continue;

      const version = extractVersion(obj.key);
      if (!version) continue;

      const matched = matchingPattern(version);
      if (!matched) continue;

      const patternIdx = PRERELEASE_PATTERNS.indexOf(matched);
      const gaPrefix = extractGaPrefix(obj.key);
      if (!gaPrefix) continue;

      const uploadedAt = obj.customMetadata.uploadedAt
        ? Date.parse(obj.customMetadata.uploadedAt)
        : obj.uploaded.getTime();

      // Drill into Map<gaPrefix, Map<patternIdx, Map<version, VersionEntry>>>
      let byPattern = groups.get(gaPrefix);
      if (!byPattern) {
        byPattern = new Map();
        groups.set(gaPrefix, byPattern);
      }

      let byVersion = byPattern.get(patternIdx);
      if (!byVersion) {
        byVersion = new Map();
        byPattern.set(patternIdx, byVersion);
      }

      let entry = byVersion.get(version);
      if (!entry) {
        entry = { uploadedAt, keys: [] };
        byVersion.set(version, entry);
      }

      entry.keys.push(obj.key);
      if (uploadedAt > entry.uploadedAt) entry.uploadedAt = uploadedAt;
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  // 2. For each (GA, pattern) group, keep `retain` most recent, delete the rest
  const toDelete: string[] = [];

  for (const [, byPattern] of groups) {
    for (const [patternIdx, byVersion] of byPattern) {
      const retain = PRERELEASE_PATTERNS[patternIdx].retain;
      const versions = [...byVersion.entries()]
        .sort((a, b) => b[1].uploadedAt - a[1].uploadedAt);

      for (const [, entry] of versions.slice(retain)) {
        toDelete.push(...entry.keys);
      }
    }
  }

  // 3. Batch-delete (R2 supports up to 1,000 keys per call)
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    await env.ARTIFACTS.delete(batch);
    deleted += batch.length;
  }

  console.log(`Cleanup: deleted ${deleted} expired pre-release artifacts`);
}

/**
 * Extract the GA prefix from an R2 key.
 * Key layout: `{group...}/{artifactId}/{version}/{filename}`
 * GA prefix:  `{group...}/{artifactId}/`
 */
function extractGaPrefix(key: string): string | null {
  const segments = key.split("/").filter(Boolean);
  // Need at least: groupId / artifactId / version / filename
  if (segments.length < 4) return null;
  return segments.slice(0, -2).join("/") + "/";
}
