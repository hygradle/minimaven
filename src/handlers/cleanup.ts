const DEFAULT_RETENTION_DAYS = 30;

export async function handleCleanup(env: Env): Promise<void> {
  const retentionDays = Number(env.RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let cursor: string | undefined;
  let deleted = 0;

  do {
    const listed = await env.ARTIFACTS.list({
      cursor,
      include: ["customMetadata"],
    });

    const expired: string[] = [];
    for (const obj of listed.objects) {
      // Only expire pre-release artifacts; releases are permanent.
      if (obj.customMetadata?.prerelease !== "true") continue;

      const uploadedAt = obj.customMetadata.uploadedAt;
      const timestamp = uploadedAt ? Date.parse(uploadedAt) : obj.uploaded.getTime();
      if (timestamp < cutoff) {
        expired.push(obj.key);
      }
    }

    if (expired.length > 0) {
      await env.ARTIFACTS.delete(expired);
      deleted += expired.length;
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  console.log(`Cleanup: deleted ${deleted} expired artifacts (retention: ${retentionDays}d)`);
}
