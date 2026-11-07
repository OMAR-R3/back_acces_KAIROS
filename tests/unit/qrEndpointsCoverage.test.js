import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ visit: vi.fn(), auth: vi.fn(), consume: vi.fn() }));
vi.mock("@/middlewares/auth", () => ({ checkRole: mocks.auth }));
vi.mock("@/services/visitService", () => ({ getVisitQRByIdAndVisitanteId: mocks.visit }));
vi.mock("@/services/qrAccessService", () => ({ consumeVisitQR: mocks.consume }));
import { GET } from "../../app/api/visits/me/[id]/qr/route.js";
import { POST } from "../../app/api/visits/validate-qr/route.js";

const token = "12345678-1234-4123-8123-123456789abc";
const other = "22345678-1234-4123-8123-123456789abc";
const visit = { id: 1, estado: "aprobada", qr_code: token, fecha: "2026-11-07", hora_inicio: "12:00:00", Accesos_QR: [] };
const get = (id = "1") => GET(new Request(`https://example.com/api/visits/me/${id}/qr?visitante_id=99`), { params: Promise.resolve({ id }) });
const request = (body = { token }, headers = {}) => new Request("https://example.com/api/visits/validate-qr", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-api-key": "a".repeat(64), ...headers },
});
async function contract(res, result, status) {
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ success: result === "valido", resultado: result });
}
let clock = Date.UTC(2026, 10, 7);
beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    // Each test gets a fresh real-limiter window, independently of test order.
    vi.setSystemTime(clock += 120_000);
    vi.stubEnv("CHECKER_API_KEY", "a".repeat(64));
    mocks.auth.mockReturnValue({ id: 7, rol: "visitante" });
    mocks.visit.mockResolvedValue({ ...visit });
    mocks.consume.mockResolvedValue("valido");
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("visitor QR endpoint coverage", () => {
    it("returns an approved own visit using authenticated identity", async () => {
        vi.setSystemTime(new Date("2026-11-07T18:00:00Z"));
        const res = await get();
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.json()).toEqual({ success: true, data: { visita_id: 1, folio: "KV-000001", qr: token, estado_qr: "valido", vigente_desde: "2026-11-07T17:30:00.000Z", vigente_hasta: "2026-11-07T18:30:00.000Z" } });
        expect(mocks.visit).toHaveBeenCalledExactlyOnceWith("1", 7);
        expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), ["visitante"]);
    });
    it("returns an identical safe 404 for alien and nonexistent URL ids", async () => {
        mocks.visit.mockResolvedValue(null);
        for (const id of ["99", "999"]) {
            const res = await get(id);
            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ success: false, error: "Visita no encontrada" });
            expect(mocks.visit).toHaveBeenLastCalledWith(id, 7);
        }
    });
    it.each(["pendiente", "cancelada", "finalizada", "rechazada"])("does not disclose a QR for %s", async estado => {
        mocks.visit.mockResolvedValue({ ...visit, estado });
        const res = await get();
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ success: false, error: "La visita aún no tiene código QR" });
    });
    it("rejects an approved visit without a QR", async () => {
        mocks.visit.mockResolvedValue({ ...visit, qr_code: null });
        const res = await get();
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ success: false, error: "La visita aún no tiene código QR" });
    });
    it("hides an expired token", async () => {
        vi.setSystemTime(new Date("2026-11-07T18:30:00.001Z"));
        const res = await get();
        expect(res.status).toBe(200);
        expect((await res.json()).data).toMatchObject({ estado_qr: "expirado", qr: null });
    });
    it.each([{ accesses: [{ id: 8 }], expired: false }, { accesses: { id: 8 }, expired: false }, { accesses: [{ id: 8 }], expired: true }])("hides used tokens with precedence over expiry: %j", async ({ accesses, expired }) => {
        vi.setSystemTime(new Date(expired ? "2026-11-08T18:00:00Z" : "2026-11-07T18:00:00Z"));
        mocks.visit.mockResolvedValue({ ...visit, Accesos_QR: accesses });
        const res = await get();
        expect(res.status).toBe(200);
        expect((await res.json()).data).toMatchObject({ estado_qr: "usado", qr: null });
    });
    it.each(["abc", "-1", "1.5"])("rejects invalid id %s without querying", async id => {
        expect((await get(id)).status).toBe(404);
        expect(mocks.visit).not.toHaveBeenCalled();
    });
    it.each(["query", "date"])("returns a safe response for %s errors", async kind => {
        if (kind === "query") mocks.visit.mockRejectedValue(new Error("private database detail"));
        else mocks.visit.mockResolvedValue({ ...visit, fecha: "invalid" });
        const res = await get();
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ success: false, error: "No se pudo obtener el código QR" });
    });
    it.each([401, 403])("does not query after authentication failure %s", async status => {
        mocks.auth.mockImplementation(() => { throw Object.assign(new Error("No autorizado"), { status }); });
        expect((await get()).status).toBe(status);
        expect(mocks.visit).not.toHaveBeenCalled();
    });
    it("keeps concurrent visitor responses isolated", async () => {
        vi.setSystemTime(new Date("2026-11-07T18:00:00Z"));
        let finish;
        mocks.visit.mockImplementation(id => id === "1" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(null));
        const own = get();
        const alien = await get("99");
        expect(alien.status).toBe(404);
        expect(await alien.json()).toEqual({ success: false, error: "Visita no encontrada" });
        finish({ ...visit });
        expect((await (await own).json()).data.qr).toBe(token);
        expect(mocks.visit.mock.calls).toEqual([["1", 7], ["99", 7]]);
    });
});

describe("checker QR endpoint contract", () => {
    it.each([["valido", 200], ["expirado", 422], ["utilizado", 409], ["invalido", 400]])("returns exact contract for %s", async (result, status) => {
        mocks.consume.mockResolvedValue(result);
        await contract(await POST(request()), result, status);
        expect(mocks.consume).toHaveBeenCalledExactlyOnceWith(token);
    });
    it.each(["null", "[]", "{", "{}", '{"token":42}', '{"token":null}', JSON.stringify({ token, checador: "spoof" }), JSON.stringify({ token: "x".repeat(1100) }), JSON.stringify({ token: token.slice(0, -1) + "!" }), JSON.stringify({ token: token.replace("4123", "1123") })])("rejects malformed input %s without consuming", async body => {
        await contract(await POST(request(body)), "invalido", 400);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it("rejects a missing body", async () => {
        await contract(await POST(new Request("https://example.com", { method: "POST", headers: { "x-api-key": "a".repeat(64), "content-type": "application/json" } })), "invalido", 400);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it.each(["text/plain", ""])("rejects content type %s", async type => {
        await contract(await POST(request({ token }, { "content-type": type })), "invalido", 400);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it.each(["", "wrong", "b".repeat(513)])("rejects absent or incorrect credentials %s", async key => {
        const req = request();
        if (key) req.headers.set("x-api-key", key);
        else req.headers.delete("x-api-key");
        await contract(await POST(req), "no_autorizado", 401);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it.each([undefined, "short", "a".repeat(513)])("fails closed for invalid configuration %s", async key => {
        vi.stubEnv("CHECKER_API_KEY", key);
        await contract(await POST(request()), "error_servicio", 503);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it("normalizes uppercase UUID before the service boundary", async () => {
        await contract(await POST(request({ token: token.toUpperCase() })), "valido", 200);
        expect(mocks.consume).toHaveBeenCalledExactlyOnceWith(token);
    });
    it("rejects a well formed but unknown or replaced UUID", async () => {
        mocks.consume.mockResolvedValue("invalido");
        await contract(await POST(request({ token: other })), "invalido", 400);
        expect(mocks.consume).toHaveBeenCalledExactlyOnceWith(other);
    });
    it("hides sensitive service errors", async () => {
        mocks.consume.mockRejectedValue(new Error("secret database detail"));
        await contract(await POST(request()), "error_servicio", 503);
    });
    it("enforces the shared quota despite changing forwarding headers and resets after its window", async () => {
        for (let i = 0; i < 120; i++) {
            await contract(await POST(request({ token }, { "x-api-key": "wrong", "x-forwarded-for": `ip-${i}` })), "no_autorizado", 401);
        }
        const res = await POST(request());
        expect(res.headers.get("retry-after")).toBe("60");
        await contract(res, "no_autorizado", 429);
        expect(mocks.consume).not.toHaveBeenCalled();
        vi.setSystemTime(Date.now() + 60_001);
        await contract(await POST(request()), "valido", 200);
    });
    it("associates concurrent responses with tokens despite reversed completion", async () => {
        let finish;
        mocks.consume.mockImplementation(value => value === token ? new Promise(resolve => { finish = resolve; }) : Promise.resolve("expirado"));
        const first = POST(request());
        await contract(await POST(request({ token: other })), "expirado", 422);
        expect(finish).toBeTypeOf("function");
        finish("valido");
        await contract(await first, "valido", 200);
        expect(mocks.consume.mock.calls).toEqual([[token], [other]]);
        // Mocked outcomes do not establish PostgreSQL atomicity.
    });
});
