/**
 * spiffe-id.test.ts — parser/validator for Workforce's narrow SPIFFE ID
 * grammar, the trust-domain allow-list check, and the pure
 * `mapSpiffeIdToPrincipalRef` mapper. No I/O, no live SPIRE.
 */
import { describe, expect, it } from "vitest";
import { principalRef } from "./principal-ref.js";
import {
  parseSpiffeId,
  isTrustDomainAllowed,
  mapSpiffeIdToPrincipalRef,
  type ParsedSpiffeId,
} from "./spiffe-id.js";

describe("parseSpiffeId — valid IDs", () => {
  it("parses a system/<name> SPIFFE ID and decomposes it", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system/scheduler");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trustDomain).toBe("prod.workforce.biroworks.com");
      expect(result.value.path).toBe("system/scheduler");
      expect(result.value.segments).toEqual(["system", "scheduler"]);
      expect(result.value.kind).toBe("system");
      expect(result.value.systemName).toBe("scheduler");
      expect(result.value.spiffeId).toBe("spiffe://prod.workforce.biroworks.com/system/scheduler");
    }
  });

  it("parses a tenant/.../cell/.../generation/<n> SPIFFE ID and decomposes it", () => {
    const result = parseSpiffeId(
      "spiffe://prod.workforce.biroworks.com/tenant/acme/cell/cell-7/generation/3",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("cell-workload");
      expect(result.value.tenantId).toBe("acme");
      expect(result.value.cellId).toBe("cell-7");
      expect(result.value.generation).toBe(3);
    }
  });

  it("parses an opaque path it doesn't recognize without rejecting it", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/some/other/path");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("opaque");
      expect(result.value.systemName).toBeUndefined();
      expect(result.value.tenantId).toBeUndefined();
    }
  });

  it("parses a single-label trust domain (no dots)", () => {
    const result = parseSpiffeId("spiffe://localdomain/system/foo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trustDomain).toBe("localdomain");
    }
  });
});

describe("parseSpiffeId — rejects malformed input", () => {
  it("rejects missing scheme", () => {
    const result = parseSpiffeId("https://example.com/system/foo");
    expect(result).toEqual({ ok: false, reason: "missing-scheme" });
  });

  it("rejects empty trust domain", () => {
    const result = parseSpiffeId("spiffe:///system/foo");
    expect(result).toEqual({ ok: false, reason: "empty-trust-domain" });
  });

  it("rejects uppercase trust domain (ambiguous case-folding)", () => {
    const result = parseSpiffeId("spiffe://Prod.Workforce.Reactorjet.Io/system/foo");
    expect(result).toEqual({ ok: false, reason: "invalid-trust-domain" });
  });

  it("rejects a trust domain with an empty label", () => {
    const result = parseSpiffeId("spiffe://prod..biroworks.com/system/foo");
    expect(result).toEqual({ ok: false, reason: "invalid-trust-domain" });
  });

  it("rejects missing path", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com");
    expect(result).toEqual({ ok: false, reason: "missing-path" });
  });

  it("rejects missing path with trailing slash only", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/");
    expect(result).toEqual({ ok: false, reason: "missing-path" });
  });

  it("rejects an empty path segment (double slash)", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system//foo");
    expect(result).toEqual({ ok: false, reason: "empty-segment" });
  });

  it("rejects a `..` path-traversal segment", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system/../secret");
    expect(result).toEqual({ ok: false, reason: "path-traversal" });
  });

  it("rejects a `.` segment", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system/./foo");
    expect(result).toEqual({ ok: false, reason: "path-traversal" });
  });

  it("rejects a segment with disallowed characters", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system/foo bar");
    expect(result).toEqual({ ok: false, reason: "invalid-segment" });
  });

  it("rejects a segment with uppercase letters", () => {
    const result = parseSpiffeId("spiffe://prod.workforce.biroworks.com/System/foo");
    expect(result).toEqual({ ok: false, reason: "invalid-segment" });
  });

  it("rejects a non-string input", () => {
    const result = parseSpiffeId(undefined as unknown as string);
    expect(result).toEqual({ ok: false, reason: "missing-scheme" });
  });
});

describe("isTrustDomainAllowed", () => {
  const allowed = ["prod.workforce.biroworks.com"] as const;

  it("accepts an exact match", () => {
    expect(isTrustDomainAllowed("prod.workforce.biroworks.com", allowed)).toBe(true);
  });

  it("rejects a staging trust domain against a production allow-list", () => {
    expect(isTrustDomainAllowed("staging.workforce.biroworks.com", allowed)).toBe(false);
  });

  it("rejects a substring/suffix match that isn't exact", () => {
    expect(isTrustDomainAllowed("workforce.biroworks.com", allowed)).toBe(false);
  });

  it("rejects when the allow-list is empty", () => {
    expect(isTrustDomainAllowed("prod.workforce.biroworks.com", [])).toBe(false);
  });
});

describe("mapSpiffeIdToPrincipalRef", () => {
  it("maps a parsed system SPIFFE ID onto a workload PrincipalRef that validates", () => {
    const parsed = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system/scheduler");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const ref = mapSpiffeIdToPrincipalRef(parsed.value);
    expect(() => principalRef.parse(ref)).not.toThrow();
    expect(ref).toEqual(
      expect.objectContaining({
        id: "spiffe://prod.workforce.biroworks.com/system/scheduler",
        kind: "workload",
        issuer: "spiffe://prod.workforce.biroworks.com",
        externalSubject: "spiffe://prod.workforce.biroworks.com/system/scheduler",
      }),
    );
  });

  it("maps a parsed cell-workload SPIFFE ID onto a workload PrincipalRef that validates", () => {
    const parsed = parseSpiffeId(
      "spiffe://prod.workforce.biroworks.com/tenant/acme/cell/cell-7/generation/3",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const ref = mapSpiffeIdToPrincipalRef(parsed.value);
    expect(() => principalRef.parse(ref)).not.toThrow();
    expect(ref.issuer).toBe("spiffe://prod.workforce.biroworks.com");
  });

  it("distinguishes staging vs prod trust domains via the issuer field", () => {
    const staging = parseSpiffeId("spiffe://staging.workforce.biroworks.com/system/scheduler");
    const prod = parseSpiffeId("spiffe://prod.workforce.biroworks.com/system/scheduler");
    expect(staging.ok && prod.ok).toBe(true);
    if (!staging.ok || !prod.ok) return;

    const stagingRef = mapSpiffeIdToPrincipalRef(staging.value);
    const prodRef = mapSpiffeIdToPrincipalRef(prod.value);
    expect(stagingRef.issuer).not.toBe(prodRef.issuer);
    expect(isTrustDomainAllowed(staging.value.trustDomain, ["prod.workforce.biroworks.com"])).toBe(
      false,
    );
    expect(isTrustDomainAllowed(prod.value.trustDomain, ["prod.workforce.biroworks.com"])).toBe(
      true,
    );
  });

  it("round-trips a manually constructed ParsedSpiffeId (opaque path) through the mapper", () => {
    const parsed: ParsedSpiffeId = {
      spiffeId: "spiffe://prod.workforce.biroworks.com/custom/path",
      trustDomain: "prod.workforce.biroworks.com",
      path: "custom/path",
      segments: ["custom", "path"],
      kind: "opaque",
    };
    const ref = mapSpiffeIdToPrincipalRef(parsed);
    expect(() => principalRef.parse(ref)).not.toThrow();
  });
});
