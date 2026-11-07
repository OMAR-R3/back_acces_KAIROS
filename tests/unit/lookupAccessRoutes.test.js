import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn(), authorize: vi.fn(), revoke: vi.fn(), visits: vi.fn() }));
vi.mock("@/services/lookupAccessService", () => ({
    requestLookupCode: mocks.request, verifyLookupCode: mocks.verify, authorizeLookup: mocks.authorize, revokeLookup: mocks.revoke,
}));
vi.mock("@/services/visitService", () => ({ getVisitsByCorreo: mocks.visits }));
import { GET } from "../../app/api/visits/lookup/route.js";
import { POST as requestCode } from "../../app/api/visits/lookup/request-code/route.js";
import { POST as verifyCode } from "../../app/api/visits/lookup/verify-code/route.js";
import { POST as logout } from "../../app/api/visits/lookup/logout/route.js";
import { lookupMode } from "../../utils/lookupPolicy.js";

let sequence = 0;
let ip;
const post = (body, headers = {}) => new Request("https://example.com/api/visits/lookup", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
});
const get = headers => new Request("https://example.com/api/visits/lookup?correo=ana@example.com", {
    headers: { "x-forwarded-for": ip, ...headers },
});
beforeEach(() => {
    ip = `lookup-route-${++sequence}`;
    vi.resetAllMocks();
    vi.stubEnv("LOOKUP_ACCESS_MODE", "prepare");
    mocks.request.mockResolvedValue({ challengeId: "challenge", browserSecret: "browser" });
    mocks.verify.mockResolvedValue({ accessToken: "session", expiresIn: 900 });
    mocks.authorize.mockResolvedValue(true);
    mocks.visits.mockResolvedValue([{ id: 1 }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("activation and compatibility", () => {
    it("defaults to legacy only when configuration is absent", () => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", undefined);
        expect(lookupMode()).toBe("legacy");
    });
    it.each(["legacy", "prepare"])("preserves anonymous consumers in %s, explicitly still vulnerable", async mode => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", mode);
        const res = await GET(get());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: [{ id: 1 }] });
        expect(mocks.authorize).not.toHaveBeenCalled();
    });
    it("does not issue credentials in legacy mode", async () => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", "legacy");
        for (const handler of [requestCode, verifyCode, logout]) {
            expect((await handler(post({}))).status).toBe(503);
        }
        expect(mocks.request).not.toHaveBeenCalled();
        expect(mocks.verify).not.toHaveBeenCalled();
    });
    it.each(["", "ENFORCED", "typo"])("fails closed on invalid mode %j", async mode => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", mode);
        expect((await GET(get())).status).toBe(500);
        expect((await requestCode(post({ correo: "ana@example.com" }))).status).toBe(503);
        expect(mocks.visits).not.toHaveBeenCalled();
    });
    it("rejects unauthorized lookup before querying any history", async () => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", "enforced");
        mocks.authorize.mockResolvedValue(false);
        const res = await GET(get());
        expect(res.status).toBe(401);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), "ana@example.com");
        expect(mocks.visits).not.toHaveBeenCalled();
    });
    it("preserves successful contract after authorization", async () => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", "enforced");
        expect(await (await GET(get({ authorization: "Bearer token" }))).json()).toEqual({ success: true, data: [{ id: 1 }] });
        expect(mocks.visits).toHaveBeenCalledExactlyOnceWith("ana@example.com");
    });
    it("never falls back to anonymous lookup when authorization storage fails", async () => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", "enforced");
        mocks.authorize.mockRejectedValue(new Error("private"));
        const res = await GET(get());
        expect(res.status).toBe(500);
        expect(await res.text()).not.toContain("private");
        expect(mocks.visits).not.toHaveBeenCalled();
    });
});

describe("credential endpoints never return history", () => {
    it("requests normalized email without querying visits", async () => {
        const res = await requestCode(post({ correo: " Ana@Example.COM " }));
        expect(res.status).toBe(202);
        expect(await res.json()).toEqual({ success: true,
            message: "Si la solicitud puede procesarse, recibirás un código", challengeId: "challenge", browserSecret: "browser" });
        expect(mocks.request).toHaveBeenCalledWith("ana@example.com", ip);
        expect(mocks.visits).not.toHaveBeenCalled();
    });
    it.each(["null", "[]", "{", JSON.stringify({ correo: "invalid" }), JSON.stringify({ correo: "a".repeat(3000) })])("rejects invalid/bounded bodies %s", async body => {
        const res = await requestCode(post(body));
        expect(res.status).toBe(400);
        expect(mocks.request).not.toHaveBeenCalled();
    });
    it("requires JSON", async () => {
        expect((await requestCode(post({}, { "content-type": "text/plain" }))).status).toBe(400);
    });
    it("passes proof to verification and returns only session credentials", async () => {
        const proof = { challengeId: "id", browserSecret: "secret", code: "01234567" };
        const res = await verifyCode(post(proof));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, accessToken: "session", expiresIn: 900 });
        expect(mocks.verify).toHaveBeenCalledWith(proof);
        expect(mocks.visits).not.toHaveBeenCalled();
    });
    it("returns generic invalid proof", async () => {
        mocks.verify.mockResolvedValue(null);
        expect((await verifyCode(post({}))).status).toBe(401);
    });
    it("logs out without touching general auth cookies", async () => {
        const res = await logout(post({}));
        expect(res.status).toBe(200);
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(mocks.revoke).toHaveBeenCalledOnce();
    });
    it.each([requestCode, verifyCode, logout])("sets privacy headers on each route", async handler => {
        const res = await handler(post({ correo: "ana@example.com" }));
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    });
    it.each(["request", "verify", "revoke"])("hides service failures for %s", async action => {
        mocks[action].mockRejectedValue(new Error("internal secret"));
        const handler = { request: requestCode, verify: verifyCode, revoke: logout }[action];
        const res = await handler(post({ correo: "ana@example.com" }));
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ error: "Verificación no disponible" });
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
    it.each([[requestCode, 5], [verifyCode, 20], [logout, 20]])("enforces per-action IP quota", async (handler, max) => {
        for (let i = 0; i < max; i++) await handler(post({ correo: "ana@example.com" }));
        const res = await handler(post({ correo: "ana@example.com" }));
        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("900");
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});
