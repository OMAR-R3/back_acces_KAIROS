import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), email: vi.fn() }));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../../services/emailService.js", () => ({ sendLookupCodeEmail: mocks.email }));
import { requestLookupCode, verifyLookupCode, authorizeLookup, revokeLookup } from "../../services/lookupAccessService.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const secret = "test-only-secret-32-bytes-or-more!";
const keyed = value => createHmac("sha256", secret).update(value).digest("hex");
const credentials = {
    challengeId: "e4911f76-9a66-4810-873b-261fc7d07903", browserSecret: "b".repeat(43), code: "01234567",
};
const bearer = token => new Request("https://example.com", { headers: { authorization: `Bearer ${token}` } });
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LOOKUP_CODE_SECRET", secret);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("isolated lookup credentials", () => {
    it("sends a code without querying visitors and stores only protected credentials", async () => {
        const result = await requestLookupCode(" Ana@Example.COM ", "ip");
        expect(Object.keys(result).sort()).toEqual(["browserSecret", "challengeId"]);
        expect(result.browserSecret).toHaveLength(43);
        const [{ code, email }] = mocks.email.mock.calls[0];
        expect(code).toMatch(/^\d{8}$/);
        expect(email).toBe("ana@example.com");
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("lookup_issue_challenge", {
            p_id: result.challengeId, p_correo: email, p_browser_hash: hash(result.browserSecret),
            p_code_hash: keyed(`code:${result.challengeId}:${code}`), p_ip_hash: keyed("ip:ip"),
        });
        expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(result.browserSecret);
    });
    it("returns the same shape without email when shared quotas suppress sending", async () => {
        mocks.rpc.mockResolvedValue({ data: false });
        expect(Object.keys(await requestLookupCode("unknown@example.com", "ip")).sort()).toEqual(["browserSecret", "challengeId"]);
        expect(mocks.email).not.toHaveBeenCalled();
    });
    it("does not expose SMTP failures", async () => {
        mocks.email.mockRejectedValue(new Error("private SMTP address"));
        await expect(requestLookupCode("ana@example.com", "ip")).resolves.toHaveProperty("challengeId");
    });
    it("generates independent browser secrets and challenges", async () => {
        const a = await requestLookupCode("ana@example.com", "ip");
        const b = await requestLookupCode("ana@example.com", "ip");
        expect(a.challengeId).not.toBe(b.challengeId);
        expect(a.browserSecret).not.toBe(b.browserSecret);
    });
    it.each(["", "short"])("rejects missing/short HMAC configuration", async value => {
        vi.stubEnv("LOOKUP_CODE_SECRET", value);
        await expect(requestLookupCode("ana@example.com", "ip")).rejects.toThrow("not configured");
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.email).not.toHaveBeenCalled();
    });
    it("rejects malformed email before storage or email", async () => {
        await expect(requestLookupCode("invalid", "ip")).rejects.toThrow();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("atomically consumes a challenge and creates a hashed, independent session", async () => {
        const result = await verifyLookupCode(credentials);
        expect(result.expiresIn).toBe(900);
        expect(result.accessToken).toHaveLength(43);
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("lookup_verify_challenge", {
            p_id: credentials.challengeId, p_browser_hash: hash(credentials.browserSecret),
            p_code_hash: keyed(`code:${credentials.challengeId}:${credentials.code}`), p_session_hash: hash(result.accessToken),
        });
        expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(result.accessToken);
    });
    it.each([
        {}, { ...credentials, code: 12345678 }, { ...credentials, code: "1234567" },
        { ...credentials, browserSecret: "QR-or-folio" }, { ...credentials, challengeId: "123" },
    ])("rejects malformed proof %j", async input => {
        await expect(verifyLookupCode(input)).resolves.toBeNull();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each([false, null, undefined, []])("never issues a token for a denied/expired/used proof (%j)", async data => {
        mocks.rpc.mockResolvedValue({ data });
        await expect(verifyLookupCode(credentials)).resolves.toBeNull();
    });
    it("authorizes the exact requested email with the hashed session", async () => {
        await expect(authorizeLookup(bearer("s".repeat(43)), "ana@example.com")).resolves.toBe(true);
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("lookup_authorize_session", {
            p_session_hash: hash("s".repeat(43)), p_correo: "ana@example.com",
        });
    });
    it.each(["", "KV-000042", "e4911f76-9a66-4810-873b-261fc7d07903", "eyJhbGciOiJIUzI1NiJ9.payload.signature"])("rejects non-lookup credential %s", async token => {
        await expect(authorizeLookup(bearer(token), "ana@example.com")).resolves.toBe(false);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("does not accept auth_token cookies", async () => {
        const req = new Request("https://example.com", { headers: { cookie: `auth_token=${"s".repeat(43)}` } });
        await expect(authorizeLookup(req, "ana@example.com")).resolves.toBe(false);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("revokes only the supplied lookup session", async () => {
        await revokeLookup(bearer("s".repeat(43)));
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("lookup_revoke_session", { p_session_hash: hash("s".repeat(43)) });
    });
    it("logout without a credential is idempotent", async () => {
        await revokeLookup(bearer(""));
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(["request", "verify", "authorize", "revoke"])("fails closed on database failure at %s", async stage => {
        mocks.rpc.mockResolvedValue({ error: { message: "internal DB details" } });
        const operations = {
            request: () => requestLookupCode("ana@example.com", "ip"),
            verify: () => verifyLookupCode(credentials),
            authorize: () => authorizeLookup(bearer("s".repeat(43)), "ana@example.com"),
            revoke: () => revokeLookup(bearer("s".repeat(43))),
        };
        await expect(operations[stage]()).rejects.toThrow("Lookup storage unavailable");
    });
});
