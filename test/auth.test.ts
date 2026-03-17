import { env, createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const BASE = "https://maven.hygradle.dev";

describe("authentication", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = new Request(`${BASE}/com/example/auth1/1.0.0/auth1-1.0.0.jar`, {
      method: "PUT",
      body: "data",
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Bearer realm="minimaven"');
  });

  it("returns 401 for non-Bearer auth schemes", async () => {
    const req = new Request(`${BASE}/com/example/auth2/1.0.0/auth2-1.0.0.jar`, {
      method: "PUT",
      body: "data",
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for wrong token", async () => {
    const req = new Request(`${BASE}/com/example/auth3/1.0.0/auth3-1.0.0.jar`, {
      method: "PUT",
      body: "data",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(403);
  });

  it("allows PUT with correct token", async () => {
    const req = new Request(`${BASE}/com/example/auth4/1.0.0/auth4-1.0.0.jar`, {
      method: "PUT",
      body: "data",
      headers: { Authorization: `Bearer ${env.PUBLISH_TOKEN}` },
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not require auth for GET", async () => {
    const req = new Request(`${BASE}/com/example/auth5/1.0.0/auth5-1.0.0.jar`);
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(404);
  });

  it("does not require auth for HEAD", async () => {
    const req = new Request(`${BASE}/com/example/auth6/1.0.0/auth6-1.0.0.jar`, {
      method: "HEAD",
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(404);
  });
});
