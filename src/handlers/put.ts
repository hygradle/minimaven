import { extractVersion, isPrerelease } from "../version";

/** Checksum sidecar extensions that Maven/Gradle append to filenames. */
const CHECKSUM_EXTENSIONS = [".md5", ".sha1", ".sha256", ".sha512"];

/**
 * Returns the base filename from a key, stripping any trailing checksum
 * extensions (e.g., `maven-metadata.xml.sha1` → `maven-metadata.xml`).
 */
function baseFilename(key: string): string {
  const slash = key.lastIndexOf("/");
  let name = slash === -1 ? key : key.slice(slash + 1);
  for (const ext of CHECKSUM_EXTENSIONS) {
    if (name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
      break; // at most one checksum extension
    }
  }
  return name;
}

export async function handlePut(request: Request, env: Env): Promise<Response> {
  const key = new URL(request.url).pathname.slice(1);
  if (!key) {
    return new Response("Bad Request", { status: 400 });
  }

  // Maven/Gradle push maven-metadata.xml on publish, but we generate it
  // dynamically on GET. Silently accept and discard to avoid R2 clutter.
  if (baseFilename(key) === "maven-metadata.xml") {
    return new Response("OK", { status: 200 });
  }

  const version = extractVersion(key);
  const prerelease = version ? isPrerelease(version) : false;

  // Release artifacts are immutable — reject overwrites.
  if (!prerelease) {
    const existing = await env.ARTIFACTS.head(key);
    if (existing) {
      return new Response("Conflict", { status: 409 });
    }
  }

  const sha256 = request.headers.get("x-amz-checksum-sha256") ?? undefined;

  await env.ARTIFACTS.put(key, request.body, {
    sha256,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      prerelease: String(prerelease),
    },
  });

  return new Response("Created", { status: 201 });
}
