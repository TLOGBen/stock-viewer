import { describe, it, expect } from "vitest";
import { resolveAppVersion } from "../src/appVersion.js";

describe("resolveAppVersion", () => {
  it("prefers the build-time injected version (packaged)", () => {
    expect(resolveAppVersion("1.7.2", () => "1.0.0")).toBe("1.7.2");
  });

  it("falls back to the root package.json version in dev (no inject)", () => {
    expect(resolveAppVersion(undefined, () => "1.7.2")).toBe("1.7.2");
  });

  it("treats an empty injected string as absent and uses the fallback", () => {
    expect(resolveAppVersion("", () => "1.7.2")).toBe("1.7.2");
  });

  it("returns 0.0.0 when the reader throws (packaged require miss)", () => {
    expect(
      resolveAppVersion(undefined, () => {
        throw new Error("ENOENT");
      }),
    ).toBe("0.0.0");
  });

  it("returns 0.0.0 when neither source yields a usable version", () => {
    expect(resolveAppVersion(undefined, () => undefined)).toBe("0.0.0");
    expect(resolveAppVersion(undefined, () => "")).toBe("0.0.0");
  });
});
