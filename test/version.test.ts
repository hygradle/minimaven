import { describe, expect, it } from "vitest";
import {
  compareVersions,
  extractVersion,
  isPrerelease,
  isVersion,
  matchingPattern,
} from "../src/version";

describe("extractVersion", () => {
  it("extracts version from standard Maven path", () => {
    expect(extractVersion("com/example/lib/1.0.0/lib-1.0.0.jar")).toBe(
      "1.0.0",
    );
  });

  it("extracts version with qualifier", () => {
    expect(extractVersion("com/example/lib/1.0.0-pr.42/lib-1.0.0-pr.42.jar")).toBe(
      "1.0.0-pr.42",
    );
  });

  it("returns null for GA-level metadata path", () => {
    expect(extractVersion("com/example/lib/maven-metadata.xml")).toBeNull();
  });

  it("returns null for path with too few segments", () => {
    expect(extractVersion("foo/bar")).toBeNull();
  });

  it("returns null when version segment does not start with digit", () => {
    expect(extractVersion("com/example/lib/submodule/maven-metadata.xml")).toBeNull();
  });

  it("handles deeply nested groupId", () => {
    expect(
      extractVersion("dev/hygradle/plugins/foo/2.1.0/foo-2.1.0.pom"),
    ).toBe("2.1.0");
  });
});

describe("isVersion", () => {
  it("returns true for strings starting with a digit", () => {
    expect(isVersion("1.0.0")).toBe(true);
    expect(isVersion("0")).toBe(true);
    expect(isVersion("9.99")).toBe(true);
  });

  it("returns false for artifact-id-like strings", () => {
    expect(isVersion("my-lib")).toBe(false);
    expect(isVersion("foo")).toBe(false);
    expect(isVersion("")).toBe(false);
  });
});

describe("isPrerelease / matchingPattern", () => {
  // With default empty PRERELEASE_PATTERNS, everything is a release
  it("treats all versions as releases when patterns are empty", () => {
    expect(isPrerelease("1.0.0")).toBe(false);
    expect(isPrerelease("1.0.0-pr.42")).toBe(false);
    expect(isPrerelease("1.0.0-beta.1")).toBe(false);
    expect(matchingPattern("1.0.0-pr.42")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("compares major versions", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
  });

  it("compares minor versions", () => {
    expect(compareVersions("1.2.0", "1.1.0")).toBeGreaterThan(0);
  });

  it("compares patch versions", () => {
    expect(compareVersions("1.0.2", "1.0.1")).toBeGreaterThan(0);
  });

  it("handles unequal segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
  });

  it("sorts a list of versions correctly", () => {
    const versions = ["1.2.0", "1.0.0", "2.0.0", "1.1.0"];
    versions.sort(compareVersions);
    expect(versions).toEqual(["1.0.0", "1.1.0", "1.2.0", "2.0.0"]);
  });
});
