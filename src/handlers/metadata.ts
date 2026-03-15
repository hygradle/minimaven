import { compareVersions, isPrerelease } from "../version";

export async function generateMetadata(
  request: Request,
  env: Env,
  gaPrefix: string,
): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const versions = await listReleaseVersions(env, gaPrefix);
  if (versions.length === 0) {
    return new Response("Not Found", { status: 404 });
  }

  versions.sort(compareVersions);
  const latest = versions[versions.length - 1];

  const segments = gaPrefix.split("/").filter(Boolean);
  const artifactId = segments[segments.length - 1];
  const groupId = segments.slice(0, -1).join(".");

  const now = new Date();
  const lastUpdated = formatTimestamp(now);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<metadata>",
    `  <groupId>${groupId}</groupId>`,
    `  <artifactId>${artifactId}</artifactId>`,
    "  <versioning>",
    `    <latest>${latest}</latest>`,
    `    <release>${latest}</release>`,
    "    <versions>",
    ...versions.map((v) => `      <version>${v}</version>`),
    "    </versions>",
    `    <lastUpdated>${lastUpdated}</lastUpdated>`,
    "  </versioning>",
    "</metadata>",
    "",
  ].join("\n");

  const response = new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=300",
    },
  });

  request.arrayBuffer; // ensure request is GET (cache.put requires it)
  await cache.put(request, response.clone());
  return response;
}

async function listReleaseVersions(
  env: Env,
  gaPrefix: string,
): Promise<string[]> {
  const versions: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await env.ARTIFACTS.list({
      prefix: gaPrefix,
      delimiter: "/",
      cursor,
    });

    for (const prefix of result.delimitedPrefixes) {
      // prefix looks like "com/example/lib/1.0.0/"
      const version = prefix.slice(gaPrefix.length, -1);
      if (version && !isPrerelease(version)) {
        versions.push(version);
      }
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return versions;
}

function formatTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}`;
}
