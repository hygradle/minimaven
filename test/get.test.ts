import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const BASE = "https://maven.hygradle.dev";

async function seedArtifact(key: string, body: string = "content"): Promise<void> {
  await env.ARTIFACTS.put(key, body, {
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      prerelease: "false",
    },
  });
}

async function get(path: string): Promise<Response> {
  const req = new Request(`${BASE}${path}`);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function head(path: string): Promise<Response> {
  const req = new Request(`${BASE}${path}`, { method: "HEAD" });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("GET handler", () => {
  it("returns 404 for empty path", async () => {
    const res = await get("/");
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent artifact", async () => {
    const res = await get("/com/example/missing/1.0.0/missing-1.0.0.jar");
    expect(res.status).toBe(404);
  });

  it("returns stored artifact with correct body", async () => {
    await seedArtifact("com/example/body/1.0.0/body-1.0.0.jar", "jar-bytes");

    const res = await get("/com/example/body/1.0.0/body-1.0.0.jar");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("jar-bytes");
  });

  it("returns Content-Type application/octet-stream", async () => {
    await seedArtifact("com/example/ctype/1.0.0/ctype-1.0.0.jar");

    const res = await get("/com/example/ctype/1.0.0/ctype-1.0.0.jar");
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("returns Content-Length header", async () => {
    await seedArtifact("com/example/clen/1.0.0/clen-1.0.0.jar", "12345");

    const res = await get("/com/example/clen/1.0.0/clen-1.0.0.jar");
    expect(res.headers.get("Content-Length")).toBe("5");
  });

  it("returns ETag header", async () => {
    await seedArtifact("com/example/etag/1.0.0/etag-1.0.0.jar");

    const res = await get("/com/example/etag/1.0.0/etag-1.0.0.jar");
    expect(res.headers.get("ETag")).toBeTruthy();
  });
});

describe("HEAD handler", () => {
  it("returns 404 for non-existent artifact", async () => {
    const res = await head("/com/example/headmiss/1.0.0/headmiss-1.0.0.jar");
    expect(res.status).toBe(404);
  });

  it("returns 200 with headers for existing artifact", async () => {
    await seedArtifact("com/example/headhit/1.0.0/headhit-1.0.0.jar", "hello");

    const res = await head("/com/example/headhit/1.0.0/headhit-1.0.0.jar");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("5");
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("returns no body", async () => {
    await seedArtifact("com/example/headnobody/1.0.0/headnobody-1.0.0.jar");

    const res = await head("/com/example/headnobody/1.0.0/headnobody-1.0.0.jar");
    const body = await res.text();
    expect(body).toBe("");
  });
});

describe("GET/PUT round-trip", () => {
  it("can PUT then GET an artifact", async () => {
    const putReq = new Request(
      `${BASE}/dev/hygradle/rtget/2.0.0/rtget-2.0.0.jar`,
      {
        method: "PUT",
        body: "plugin-bytes",
        headers: { Authorization: `Bearer ${env.PUBLISH_TOKEN}` },
      },
    );
    const putCtx = createExecutionContext();
    const putRes = await worker.fetch(putReq, env, putCtx);
    await waitOnExecutionContext(putCtx);
    expect(putRes.status).toBe(201);

    const getRes = await get("/dev/hygradle/rtget/2.0.0/rtget-2.0.0.jar");
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).toBe("plugin-bytes");
  });

  it("can PUT then HEAD an artifact", async () => {
    const putReq = new Request(
      `${BASE}/dev/hygradle/rthead/2.0.0/rthead-2.0.0.pom`,
      {
        method: "PUT",
        body: "<project/>",
        headers: { Authorization: `Bearer ${env.PUBLISH_TOKEN}` },
      },
    );
    const putCtx = createExecutionContext();
    await worker.fetch(putReq, env, putCtx);
    await waitOnExecutionContext(putCtx);

    const res = await head("/dev/hygradle/rthead/2.0.0/rthead-2.0.0.pom");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("10");
  });
});
