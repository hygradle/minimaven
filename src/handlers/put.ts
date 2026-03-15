import { extractVersion, isPrerelease } from "../version";

export async function handlePut(request: Request, env: Env): Promise<Response> {
  const key = new URL(request.url).pathname.slice(1);
  if (!key) {
    return new Response("Bad Request", { status: 400 });
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
