import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { rpc: mocks.rpc } }));
import { consumeVisitQR } from "../../services/qrAccessService.js";
const token = "12345678-1234-4123-8123-123456789abc";
beforeEach(() => vi.resetAllMocks());
describe("QR RPC validation service", () => {
    it.each(["valido", "expirado", "utilizado", "invalido"])("passes PostgreSQL result %s through the exact RPC call", async result => {
        mocks.rpc.mockResolvedValue({ data: result, error: null });
        expect(await consumeVisitQR(token)).toBe(result);
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("validate_and_consume_visit_qr", { p_token: token });
    });
    it.each([null, undefined, "unexpected", "no_autorizado", {}, ["valido"]])("rejects unexpected RPC data %j", async data => {
        mocks.rpc.mockResolvedValue({ data, error: null });
        await expect(consumeVisitQR(token)).rejects.toThrow(/^QR service unavailable$/);
    });
    it("hides Supabase error details even if data also contains a valid result", async () => {
        mocks.rpc.mockResolvedValue({ data: "valido", error: { message: "secret SQL detail", code: "private" } });
        await expect(consumeVisitQR(token)).rejects.toThrow(/^QR service unavailable$/);
    });
    it("rejects transport failure without returning a successful result", async () => {
        mocks.rpc.mockRejectedValue(new Error("network unavailable"));
        await expect(consumeVisitQR(token)).rejects.toThrow("network unavailable");
        // Production propagates transport errors internally; the route must sanitize them.
    });
    it("keeps concurrent RPC results associated with their calls", async () => {
        const other = "22345678-1234-4123-8123-123456789abc";
        let finish;
        mocks.rpc.mockImplementation((name, { p_token }) => p_token === token
            ? new Promise(resolve => { finish = resolve; })
            : Promise.resolve({ data: "utilizado", error: null }));
        const first = consumeVisitQR(token);
        expect(await consumeVisitQR(other)).toBe("utilizado");
        finish({ data: "valido", error: null });
        expect(await first).toBe("valido");
        expect(mocks.rpc.mock.calls).toEqual([
            ["validate_and_consume_visit_qr", { p_token: token }],
            ["validate_and_consume_visit_qr", { p_token: other }],
        ]);
        // No real database: this verifies response isolation, not atomic consumption.
    });
});
