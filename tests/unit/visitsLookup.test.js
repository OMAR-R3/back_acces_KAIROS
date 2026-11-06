import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/services/visitService", () => ({ getVisitsByCorreo: mocks.lookup }));

// Use the real limiter: cover the route's quota, isolation and expiry together.
import { GET } from "../../app/api/visits/lookup/route.js";

let ipSequence = 0;
let ip;
const request = query => new Request(`http://localhost/api/visits/lookup${query}`, {
    headers: { "x-forwarded-for": ip },
});
const byCorreo = correo => request(`?correo=${encodeURIComponent(correo)}`);

beforeEach(() => {
    vi.stubEnv("LOOKUP_ACCESS_MODE", "legacy");
    ip = `lookup-test-${++ipSequence}`;
    mocks.lookup.mockReset().mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("GET /api/visits/lookup", () => {
    it("normalizes whitespace and case while preserving plus tags", async () => {
        const res = await GET(byCorreo("  Ana+Visitas@Example.COM  "));
        expect(res.status).toBe(200);
        expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("ana+visitas@example.com");
        expect(await res.json()).toEqual({ success: true, data: [] });
    });

    it.each(["", "?correo=", "?correo=%20%20"])("rejects missing or empty email: %s", async query => {
        const res = await GET(request(query));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "El correo es requerido" });
        expect(mocks.lookup).not.toHaveBeenCalled();
    });

    it.each([
        "ana", "ana@", "@example.com", "a@@example.com", "a b@example.com",
        "a@example", "a@-example.com", "a@example-.com", "a@example..com",
        ".ana@example.com", "ana.@example.com", "a..b@example.com",
        "a\n@example.com", `${"a".repeat(65)}@example.com`,
        `a@${"b".repeat(64)}.com`,
        `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
    ])("rejects malformed or oversized email %j", async correo => {
        const res = await GET(byCorreo(correo));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "El correo no es válido" });
        expect(mocks.lookup).not.toHaveBeenCalled();
    });

    it("accepts a 254-character address", async () => {
        const correo = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
        expect(correo).toHaveLength(254);
        expect((await GET(byCorreo(correo))).status).toBe(200);
    });

    it("rejects repeated correo parameters", async () => {
        expect((await GET(request("?correo=a@example.com&correo=b@example.com"))).status).toBe(400);
        expect(mocks.lookup).not.toHaveBeenCalled();
    });

    it("preserves the successful response and existing fields", async () => {
        const visits = [{ id: 7, fecha: "2026-11-06", hora_inicio: "10:00:00", motivo: "Consulta",
            estado: "pendiente", created_at: "2026-11-01T10:00:00Z",
            Departamentos: { nombre: "Servicios", ubicacion: "A" } }];
        mocks.lookup.mockResolvedValue(visits);
        expect(await (await GET(byCorreo("ana@example.com"))).json()).toEqual({ success: true, data: visits });
    });

    it("returns an empty list for a nonexistent visitor", async () => {
        expect(await (await GET(byCorreo("unknown@example.com"))).json()).toEqual({ success: true, data: [] });
    });

    it("hides database errors and their status", async () => {
        mocks.lookup.mockRejectedValue(Object.assign(new Error("private table / credential"), { status: 429 }));
        const res = await GET(byCorreo("ana@example.com"));
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: "No se pudieron consultar las visitas" });
    });

    it("limits all emails and invalid requests under the same IP quota, then expires", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
        for (let i = 0; i < 30; i++) {
            expect((await GET(byCorreo(i % 2 ? `ana${i}@example.com` : "invalid"))).status).toBe(i % 2 ? 200 : 400);
        }
        const res = await GET(byCorreo("other@example.com"));
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("900");
        expect(await res.json()).toEqual({ error: "Demasiadas solicitudes, intenta más tarde" });
        expect(mocks.lookup).toHaveBeenCalledTimes(15);
        const originalIp = ip;
        ip = `lookup-test-${++ipSequence}`;
        expect((await GET(byCorreo("ana@example.com"))).status).toBe(200);
        ip = originalIp;
        vi.advanceTimersByTime(15 * 60 * 1000 + 1);
        expect((await GET(byCorreo("ana@example.com"))).status).toBe(200);
    });

    it.each([200, 400, 429, 500])("sets privacy headers on status %s", async status => {
        if (status === 500) mocks.lookup.mockRejectedValue(new Error("internal"));
        if (status === 429) for (let i = 0; i < 30; i++) await GET(request(""));
        const res = await GET(status === 400 ? request("") : byCorreo("ana@example.com"));
        expect(res.status).toBe(status);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    });
});
