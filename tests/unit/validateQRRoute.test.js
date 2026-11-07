import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ consume: vi.fn(), rpc: vi.fn() }));
vi.mock("@/services/qrAccessService", () => ({ consumeVisitQR: mocks.consume }));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { rpc: mocks.rpc } }));
import { POST } from "../../app/api/visits/validate-qr/route.js";
const { consumeVisitQR } = await vi.importActual("../../services/qrAccessService.js");

const token = "12345678-1234-4123-8123-123456789abc";
const request = (body = { token }, headers = {}) => new Request("https://example.com/api/visits/validate-qr", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-api-key": "a".repeat(64), ...headers },
});
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CHECKER_API_KEY", "a".repeat(64));
    mocks.consume.mockResolvedValue("valido");
});
afterEach(() => vi.unstubAllEnvs());

describe("QR consumption route", () => {
    it.each([["valido", 200], ["expirado", 422], ["utilizado", 409], ["invalido", 400]])("maps %s without disclosing visit data", async (result, status) => {
        mocks.consume.mockResolvedValue(result);
        const res = await POST(request());
        expect(res.status).toBe(status);
        expect(await res.json()).toEqual({ success: result === "valido", resultado: result });
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
    it.each(["null", "[]", "{", JSON.stringify({ token, checador: "spoof" }), JSON.stringify({ token: "x".repeat(1100) })])("rejects malformed input without consuming %s", async body => {
        expect((await POST(request(body))).status).toBe(400);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it("rejects wrong credentials before consuming", async () => {
        expect((await POST(request({ token }, { "x-api-key": "wrong" }))).status).toBe(401);
        expect(mocks.consume).not.toHaveBeenCalled();
    });
    it("hides service failures", async () => {
        mocks.consume.mockRejectedValue(new Error("secret database detail"));
        const res = await POST(request());
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ success: false, resultado: "error_servicio" });
    });
    it("limits wrong credentials even when forwarding headers change", async () => {
        let res;
        for (let i = 0; i < 121; i++) {
            res = await POST(request({ token }, { "x-api-key": "wrong", "x-forwarded-for": `ip-${i}` }));
        }
        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("60");
        expect(mocks.consume).not.toHaveBeenCalled();
    });
});

describe("QR RPC service", () => {
    it("calls only the atomic RPC", async () => {
        mocks.rpc.mockResolvedValue({ data: "valido", error: null });
        expect(await consumeVisitQR(token)).toBe("valido");
        expect(mocks.rpc).toHaveBeenCalledWith("validate_and_consume_visit_qr", { p_token: token });
    });
    it("fails closed on unexpected RPC results", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
        await expect(consumeVisitQR(token)).rejects.toThrow("QR service unavailable");
    });
});
