import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const BASE = "https://maven.hygradle.dev";

function putRequest(path: string, body: string = "data"): Request {
  return new Request(`${BASE}${path}`, {
    method: "PUT",
    body,
    headers: { Authorization: `Bearer ${env.PUBLISH_TOKEN}` },
  });
}

async function put(path: string, body: string = "data"): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(putRequest(path, body), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("PUT handler", () => {
  it("returns 400 for empty path", async () => {
    const res = await put("/");
    expect(res.status).toBe(400);
  });

  it("stores an artifact and returns 201", async () => {
    const res = await put(
      "/com/example/store/1.0.0/store-1.0.0.jar",
      "jar-content",
    );
    expect(res.status).toBe(201);

    const obj = await env.ARTIFACTS.get("com/example/store/1.0.0/store-1.0.0.jar");
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe("jar-content");
  });

  it("sets custom metadata on stored artifacts", async () => {
    await put("/com/example/meta/1.0.0/meta-1.0.0.jar");

    const head = await env.ARTIFACTS.head("com/example/meta/1.0.0/meta-1.0.0.jar");
    expect(head?.customMetadata?.uploadedAt).toBeDefined();
    expect(head?.customMetadata?.prerelease).toBe("false");
  });

  it("rejects overwrite of release artifact with 409", async () => {
    await put("/com/example/immut/1.0.0/immut-1.0.0.jar", "first");
    const res = await put("/com/example/immut/1.0.0/immut-1.0.0.jar", "second");
    expect(res.status).toBe(409);
    expect(await res.text()).toBe("Conflict");

    const obj = await env.ARTIFACTS.get("com/example/immut/1.0.0/immut-1.0.0.jar");
    expect(await obj!.text()).toBe("first");
  });

  it("silently discards GA-level maven-metadata.xml", async () => {
    const res = await put(
      "/com/example/discard/maven-metadata.xml",
      "<metadata/>",
    );
    expect(res.status).toBe(200);

    const obj = await env.ARTIFACTS.get("com/example/discard/maven-metadata.xml");
    expect(obj).toBeNull();
  });

  it("silently discards GA-level metadata checksum sidecars", async () => {
    for (const ext of [".md5", ".sha1", ".sha256", ".sha512"]) {
      const res = await put(
        `/com/example/checksums/maven-metadata.xml${ext}`,
        "checksum",
      );
      expect(res.status).toBe(200);

      const obj = await env.ARTIFACTS.get(
        `com/example/checksums/maven-metadata.xml${ext}`,
      );
      expect(obj).toBeNull();
    }
  });

  it("stores version-level maven-metadata.xml normally", async () => {
    const res = await put(
      "/com/example/vlmeta/1.0.0/maven-metadata.xml",
      "<metadata/>",
    );
    expect(res.status).toBe(201);

    const obj = await env.ARTIFACTS.get(
      "com/example/vlmeta/1.0.0/maven-metadata.xml",
    );
    expect(obj).not.toBeNull();
  });

  it("stores .md5 and .sha1 checksum sidecars", async () => {
    const res1 = await put(
      "/com/example/sidecar/1.0.0/sidecar-1.0.0.jar.md5",
      "abc123",
    );
    expect(res1.status).toBe(201);

    const res2 = await put(
      "/com/example/sidecar/1.0.0/sidecar-1.0.0.jar.sha1",
      "def456",
    );
    expect(res2.status).toBe(201);
  });

  it("stores .pom files", async () => {
    const res = await put(
      "/com/example/pom/1.0.0/pom-1.0.0.pom",
      "<project/>",
    );
    expect(res.status).toBe(201);
  });
});

describe("PUT method routing", () => {
  it("returns 405 for DELETE", async () => {
    const req = new Request(`${BASE}/com/example/lib/1.0.0/lib-1.0.0.jar`, {
      method: "DELETE",
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, PUT");
  });

  it("returns 405 for POST", async () => {
    const req = new Request(`${BASE}/com/example/lib/1.0.0/lib-1.0.0.jar`, {
      method: "POST",
      body: "data",
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(405);
  });
});
