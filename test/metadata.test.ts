import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const BASE = "https://maven.hygradle.dev";

async function seedVersion(
  ga: string,
  version: string,
  filename: string = "lib.jar",
): Promise<void> {
  await env.ARTIFACTS.put(`${ga}${version}/${filename}`, "content", {
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      prerelease: "false",
    },
  });
}

async function getMetadata(gaPath: string): Promise<Response> {
  // Use unique URLs to avoid Workers Cache API collisions between tests
  const url = `${BASE}/${gaPath}maven-metadata.xml`;
  const req = new Request(url);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("GA-level maven-metadata.xml", () => {
  it("returns 404 when no versions exist", async () => {
    const res = await getMetadata("com/example/empty/");
    expect(res.status).toBe(404);
  });

  it("returns 404 for group-level path (not a real GA)", async () => {
    await seedVersion("com/grplevel/lib/", "1.0.0");

    const res = await getMetadata("com/grplevel/");
    expect(res.status).toBe(404);
  });

  it("generates metadata for a single release version", async () => {
    await seedVersion("com/example/single/", "1.0.0");

    const res = await getMetadata("com/example/single/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml");

    const xml = await res.text();
    expect(xml).toContain("<groupId>com.example</groupId>");
    expect(xml).toContain("<artifactId>single</artifactId>");
    expect(xml).toContain("<latest>1.0.0</latest>");
    expect(xml).toContain("<release>1.0.0</release>");
    expect(xml).toContain("<version>1.0.0</version>");
  });

  it("generates metadata with multiple versions sorted by semver", async () => {
    await seedVersion("com/example/multi/", "1.0.0");
    await seedVersion("com/example/multi/", "2.0.0");
    await seedVersion("com/example/multi/", "1.1.0");

    const res = await getMetadata("com/example/multi/");
    expect(res.status).toBe(200);

    const xml = await res.text();
    expect(xml).toContain("<latest>2.0.0</latest>");
    expect(xml).toContain("<release>2.0.0</release>");

    // Versions should appear in sorted order
    const versionMatches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(
      (m) => m[1],
    );
    expect(versionMatches).toEqual(["1.0.0", "1.1.0", "2.0.0"]);
  });

  it("includes lastUpdated timestamp", async () => {
    await seedVersion("com/example/ts/", "1.0.0");

    const res = await getMetadata("com/example/ts/");
    const xml = await res.text();
    expect(xml).toMatch(/<lastUpdated>\d{14}<\/lastUpdated>/);
  });

  it("sets Cache-Control header", async () => {
    await seedVersion("com/example/cache/", "1.0.0");

    const res = await getMetadata("com/example/cache/");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("handles deeply nested groupIds", async () => {
    await seedVersion("dev/hygradle/plugins/core/", "3.0.0");

    const res = await getMetadata("dev/hygradle/plugins/core/");
    expect(res.status).toBe(200);

    const xml = await res.text();
    expect(xml).toContain("<groupId>dev.hygradle.plugins</groupId>");
    expect(xml).toContain("<artifactId>core</artifactId>");
  });
});

describe("version-level maven-metadata.xml", () => {
  it("serves version-level metadata from R2", async () => {
    const key = "com/example/vlevel/1.0.0/maven-metadata.xml";
    await env.ARTIFACTS.put(key, "<metadata>version-level</metadata>", {
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        prerelease: "false",
      },
    });

    const req = new Request(`${BASE}/${key}`);
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<metadata>version-level</metadata>");
  });
});
