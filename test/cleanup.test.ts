import { env, createExecutionContext } from "cloudflare:test";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import worker from "../src/index";
import * as versionModule from "../src/version";

async function seedPrerelease(
  ga: string,
  version: string,
  files: string[],
  uploadedAt: string,
): Promise<void> {
  for (const file of files) {
    await env.ARTIFACTS.put(`${ga}${version}/${file}`, "content", {
      customMetadata: {
        uploadedAt,
        prerelease: "true",
      },
    });
  }
}

async function seedRelease(
  ga: string,
  version: string,
  files: string[],
): Promise<void> {
  for (const file of files) {
    await env.ARTIFACTS.put(`${ga}${version}/${file}`, "content", {
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        prerelease: "false",
      },
    });
  }
}

async function objectExists(key: string): Promise<boolean> {
  const head = await env.ARTIFACTS.head(key);
  return head !== null;
}

async function triggerCleanup(): Promise<void> {
  await worker.scheduled(
    { scheduledTime: Date.now(), cron: "0 3 * * *", noRetry() {} } as ScheduledController,
    env,
    createExecutionContext(),
  );
}

describe("cleanup handler", () => {
  it("is a no-op when PRERELEASE_PATTERNS is empty", async () => {
    await seedPrerelease("com/example/noop/", "1.0.0-pr.1", ["lib.jar"], "2025-01-01T00:00:00Z");

    await triggerCleanup();

    expect(await objectExists("com/example/noop/1.0.0-pr.1/lib.jar")).toBe(true);
  });

  describe("with configured patterns", () => {
    let originalPatterns: versionModule.PrereleasePattern[];

    beforeEach(() => {
      originalPatterns = [...versionModule.PRERELEASE_PATTERNS];
      versionModule.PRERELEASE_PATTERNS.length = 0;
      versionModule.PRERELEASE_PATTERNS.push(
        { pattern: /^pr\.\d+$/, retain: 2 },
      );
    });

    afterEach(() => {
      versionModule.PRERELEASE_PATTERNS.length = 0;
      versionModule.PRERELEASE_PATTERNS.push(...originalPatterns);
    });

    it("retains the N most recent versions and deletes the rest", async () => {
      const ga = "com/example/retain/";
      const files = ["lib.jar", "lib.pom"];

      await seedPrerelease(ga, "1.0.0-pr.1", files, "2025-01-01T00:00:00Z");
      await seedPrerelease(ga, "1.0.0-pr.2", files, "2025-01-02T00:00:00Z");
      await seedPrerelease(ga, "1.0.0-pr.3", files, "2025-01-03T00:00:00Z");
      await seedPrerelease(ga, "1.0.0-pr.4", files, "2025-01-04T00:00:00Z");

      await triggerCleanup();

      // retain=2: keep pr.3 and pr.4 (most recent), delete pr.1 and pr.2
      expect(await objectExists(`${ga}1.0.0-pr.4/lib.jar`)).toBe(true);
      expect(await objectExists(`${ga}1.0.0-pr.4/lib.pom`)).toBe(true);
      expect(await objectExists(`${ga}1.0.0-pr.3/lib.jar`)).toBe(true);
      expect(await objectExists(`${ga}1.0.0-pr.3/lib.pom`)).toBe(true);

      expect(await objectExists(`${ga}1.0.0-pr.2/lib.jar`)).toBe(false);
      expect(await objectExists(`${ga}1.0.0-pr.2/lib.pom`)).toBe(false);
      expect(await objectExists(`${ga}1.0.0-pr.1/lib.jar`)).toBe(false);
      expect(await objectExists(`${ga}1.0.0-pr.1/lib.pom`)).toBe(false);
    });

    it("never deletes release artifacts", async () => {
      const ga = "com/example/relkeep/";

      await seedRelease(ga, "1.0.0", ["lib.jar"]);
      await seedPrerelease(ga, "1.0.0-pr.1", ["lib.jar"], "2025-01-01T00:00:00Z");

      await triggerCleanup();

      expect(await objectExists(`${ga}1.0.0/lib.jar`)).toBe(true);
    });

    it("groups cleanup independently per GA coordinate", async () => {
      const files = ["lib.jar"];

      // GA 1: 3 versions (retain 2 -> delete 1)
      await seedPrerelease("com/example/ga1/", "1.0.0-pr.1", files, "2025-01-01T00:00:00Z");
      await seedPrerelease("com/example/ga1/", "1.0.0-pr.2", files, "2025-01-02T00:00:00Z");
      await seedPrerelease("com/example/ga1/", "1.0.0-pr.3", files, "2025-01-03T00:00:00Z");

      // GA 2: 3 versions (retain 2 -> delete 1)
      await seedPrerelease("com/example/ga2/", "1.0.0-pr.10", files, "2025-02-01T00:00:00Z");
      await seedPrerelease("com/example/ga2/", "1.0.0-pr.11", files, "2025-02-02T00:00:00Z");
      await seedPrerelease("com/example/ga2/", "1.0.0-pr.12", files, "2025-02-03T00:00:00Z");

      await triggerCleanup();

      expect(await objectExists("com/example/ga1/1.0.0-pr.3/lib.jar")).toBe(true);
      expect(await objectExists("com/example/ga1/1.0.0-pr.2/lib.jar")).toBe(true);
      expect(await objectExists("com/example/ga1/1.0.0-pr.1/lib.jar")).toBe(false);

      expect(await objectExists("com/example/ga2/1.0.0-pr.12/lib.jar")).toBe(true);
      expect(await objectExists("com/example/ga2/1.0.0-pr.11/lib.jar")).toBe(true);
      expect(await objectExists("com/example/ga2/1.0.0-pr.10/lib.jar")).toBe(false);
    });

    it("does nothing when fewer versions than retain count", async () => {
      const ga = "com/example/fewver/";
      await seedPrerelease(ga, "1.0.0-pr.1", ["lib.jar"], "2025-01-01T00:00:00Z");

      await triggerCleanup();

      expect(await objectExists(`${ga}1.0.0-pr.1/lib.jar`)).toBe(true);
    });
  });
});
