/**
 * principal-ref.test.ts — PrincipalRef/DelegationSubject/IdentityBindingRef
 * schemas and the pure `resolvePrincipalFromBinding` claims-to-principal
 * mapper. No I/O, no live IdP, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  principalRef,
  delegationSubject,
  identityBindingRef,
  resolvePrincipalFromBinding,
  type IdentityBindingRef,
  type PrincipalClaims,
} from "./principal-ref.js";

function binding(overrides: Partial<IdentityBindingRef> = {}): IdentityBindingRef {
  return {
    issuer: "https://idp.example.com",
    subject: "sub-123",
    clientId: "client-abc",
    principalId: "principal-1",
    bindingType: "human",
    tenantId: "tenant-a",
    organisationId: "org-a",
    enabled: true,
    revoked: false,
    ...overrides,
  };
}

function claims(overrides: Partial<PrincipalClaims> = {}): PrincipalClaims {
  return {
    issuer: "https://idp.example.com",
    subject: "sub-123",
    clientId: "client-abc",
    tenantId: "tenant-a",
    organisationId: "org-a",
    ...overrides,
  };
}

describe("principalRef / delegationSubject / identityBindingRef schemas", () => {
  it("accepts the widened kind union including workload and organisation", () => {
    expect(() =>
      principalRef.parse({ id: "p1", kind: "workload", issuer: "https://idp.example.com" }),
    ).not.toThrow();
    expect(() =>
      principalRef.parse({ id: "p1", kind: "organisation", issuer: "https://idp.example.com" }),
    ).not.toThrow();
  });

  it("accepts displayName and externalSubject as optional", () => {
    const ref = principalRef.parse({
      id: "p1",
      kind: "agent",
      issuer: "https://idp.example.com",
      displayName: "Agent One",
      externalSubject: "sub-123",
    });
    expect(ref.displayName).toBe("Agent One");
    expect(ref.externalSubject).toBe("sub-123");
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      principalRef.parse({
        id: "p1",
        kind: "human",
        issuer: "https://idp.example.com",
        extra: "nope",
      }),
    ).toThrow();
  });

  it("delegationSubject requires workload/requestedBy/accountableTo, agent optional", () => {
    const workload = principalRef.parse({ id: "w1", kind: "workload", issuer: "iss" });
    const requestedBy = principalRef.parse({ id: "h1", kind: "human", issuer: "iss" });
    const accountableTo = principalRef.parse({ id: "o1", kind: "organisation", issuer: "iss" });
    expect(() => delegationSubject.parse({ workload, requestedBy, accountableTo })).not.toThrow();
    expect(() =>
      delegationSubject.parse({
        workload,
        agent: principalRef.parse({ id: "a1", kind: "agent", issuer: "iss" }),
        requestedBy,
        accountableTo,
      }),
    ).not.toThrow();
    expect(() => delegationSubject.parse({ workload, accountableTo })).toThrow();
  });

  it("identityBindingRef requires enabled/revoked booleans and a bindingType", () => {
    expect(() => identityBindingRef.parse(binding())).not.toThrow();
    expect(() =>
      identityBindingRef.parse({ ...binding(), bindingType: "not-a-kind" }),
    ).toThrow();
  });
});

describe("resolvePrincipalFromBinding", () => {
  it("resolves a matching, enabled, non-revoked binding to a PrincipalRef", () => {
    const result = resolvePrincipalFromBinding(claims(), [binding()]);
    expect(result).toEqual(
      expect.objectContaining({
        id: "principal-1",
        kind: "human",
        issuer: "https://idp.example.com",
        tenantId: "tenant-a",
        organisationId: "org-a",
        externalSubject: "sub-123",
      }),
    );
  });

  it("never upgrades role from IdP group claims — binding record is authoritative", () => {
    const result = resolvePrincipalFromBinding(
      claims({ groups: ["admin", "superuser"] }),
      [binding({ bindingType: "human" })],
    );
    expect(result).toEqual(
      expect.objectContaining({ kind: "human", id: "principal-1" }),
    );
  });

  it("rejects with no-binding when subject is unbound", () => {
    const result = resolvePrincipalFromBinding(claims({ subject: "unbound-subject" }), [binding()]);
    expect(result).toEqual({ rejected: "no-binding" });
  });

  it("rejects with binding-disabled for an otherwise-valid subject match", () => {
    const result = resolvePrincipalFromBinding(claims(), [binding({ enabled: false })]);
    expect(result).toEqual({ rejected: "binding-disabled" });
  });

  it("rejects with binding-revoked", () => {
    const result = resolvePrincipalFromBinding(claims(), [binding({ revoked: true })]);
    expect(result).toEqual({ rejected: "binding-revoked" });
  });

  it("revoked takes precedence over disabled when both are true", () => {
    const result = resolvePrincipalFromBinding(
      claims(),
      [binding({ enabled: false, revoked: true })],
    );
    expect(result).toEqual({ rejected: "binding-revoked" });
  });

  it("rejects with tenant-mismatch when claims tenant disagrees with the binding's", () => {
    const result = resolvePrincipalFromBinding(claims({ tenantId: "tenant-b" }), [binding()]);
    expect(result).toEqual({ rejected: "tenant-mismatch" });
  });

  it("rejects with tenant-mismatch when claims organisation disagrees with the binding's", () => {
    const result = resolvePrincipalFromBinding(claims({ organisationId: "org-b" }), [binding()]);
    expect(result).toEqual({ rejected: "tenant-mismatch" });
  });

  it("honors the (issuer, subject, clientId) uniqueness assumption — matches only the exact tuple", () => {
    const bindings = [
      binding({ clientId: "client-abc", principalId: "principal-abc" }),
      binding({ clientId: "client-xyz", principalId: "principal-xyz" }),
    ];
    const result = resolvePrincipalFromBinding(claims({ clientId: "client-xyz" }), bindings);
    expect(result).toEqual(expect.objectContaining({ id: "principal-xyz" }));
  });

  it("matches on (issuer, subject) alone when clientId is absent from claims", () => {
    const result = resolvePrincipalFromBinding(
      claims({ clientId: undefined }),
      [binding({ clientId: "client-abc" })],
    );
    expect(result).toEqual(expect.objectContaining({ id: "principal-1" }));
  });

  it("does not match a different issuer even with the same subject", () => {
    const result = resolvePrincipalFromBinding(
      claims({ issuer: "https://other-idp.example.com" }),
      [binding()],
    );
    expect(result).toEqual({ rejected: "no-binding" });
  });
});
