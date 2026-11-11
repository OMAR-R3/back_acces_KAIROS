import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), visit: vi.fn(), log: vi.fn() }));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/services/visitService", () => ({ validateQR: mocks.visit }));
vi.mock("@/services/logService", () => ({ createLog: mocks.log }));
vi.mock("@/utils/jwt", async () => {
    const { default: jwt } = await import("jsonwebtoken");
    return { verifyToken: token => jwt.verify(token, "legacy-route-test-secret") };
});
import { POST } from "../../app/api/visits/validate/route.js";
const token = "12345678-1234-4123-8123-123456789abc";
const visita = { id: 8, Visitantes: { nombre: "Visitante" } };
function request(body = { token }, role = "guardia", session) {
    const headers = { "content-type": "application/json" };
    if (role !== null) headers.cookie = `auth_token=${session ?? jwt.sign({ id: 7, rol: role }, "legacy-route-test-secret", { expiresIn: "1h" })}`;
    return new Request("https://example.com/api/visits/validate", {
        method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
    });
}
async function contract(response, status, resultado) {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ success: resultado === "valido", valid: resultado === "valido", resultado });
    return body;
}
beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: "valido", error: null });
    mocks.visit.mockResolvedValue(visita);
    mocks.log.mockResolvedValue({});
});
describe("legacy session QR consumption", () => {
    it.each(["guardia", "recepcionista", "administrador"])("allows %s and preserves display data", async role => {
        expect(await contract(await POST(request({ token, usuario_id: 999 }, role)), 200, "valido")).toEqual({ success: true, valid: true, resultado: "valido", data: visita });
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("validate_and_consume_visit_qr", { p_token: token });
        expect(mocks.log).toHaveBeenCalledWith(7, expect.any(String));
    });
    it("returns utilizado on the second attempt, without looking up data again", async () => {
        mocks.rpc.mockResolvedValueOnce({ data: "valido", error: null }).mockResolvedValueOnce({ data: "utilizado", error: null });
        await contract(await POST(request()), 200, "valido");
        await contract(await POST(request()), 409, "utilizado");
        expect(mocks.visit).toHaveBeenCalledTimes(1);
    });
    it.each([["expirado", 422], ["invalido", 400]])("maps RPC result %s without granting access", async (result, status) => {
        mocks.rpc.mockResolvedValue({ data: result, error: null });
        await contract(await POST(request()), status, result);
        expect(mocks.visit).not.toHaveBeenCalled();
        expect(mocks.log).not.toHaveBeenCalled();
    });
    it.each([null, "invalid", "expired"])("rejects missing/invalid/expired session: %s", async kind => {
        const session = kind === "expired" ? jwt.sign({ id: 7, rol: "guardia" }, "legacy-route-test-secret", { expiresIn: -1 }) : kind;
        await contract(await POST(request({ token }, kind === null ? null : "guardia", session)), 401, "no_autorizado");
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("rejects unauthorized roles before parsing or consuming", async () => {
        await contract(await POST(request("{", "visitante")), 403, "prohibido");
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(["{", "null", "[]", "{}", '{"token":42}', '{"token":"incorrecto"}'])("rejects malformed input %s", async body => {
        await contract(await POST(request(body)), 400, "invalido");
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("normalizes uppercase tokens", async () => {
        await POST(request({ token: token.toUpperCase() }));
        expect(mocks.rpc).toHaveBeenCalledWith("validate_and_consume_visit_qr", { p_token: token });
    });
    it("preserves each concurrent RPC outcome with only one successful response", async () => {
        // Scripted database outcomes test HTTP propagation, not SQL locking.
        let finish;
        mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
            .mockResolvedValueOnce({ data: "utilizado", error: null });
        const first = POST(request());
        await contract(await POST(request()), 409, "utilizado");
        finish({ data: "valido", error: null });
        await contract(await first, 200, "valido");
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
        expect(mocks.visit).toHaveBeenCalledTimes(1);
    });
    it.each(["sql", "transport", "unexpected"])("fails closed on %s RPC failure", async kind => {
        if (kind === "transport") mocks.rpc.mockRejectedValue(new Error("private transport detail"));
        else mocks.rpc.mockResolvedValue({ data: kind === "sql" ? "valido" : "unexpected", error: kind === "sql" ? { message: "private SQL detail" } : null });
        const body = await contract(await POST(request()), 503, "error_servicio");
        expect(body.error).toBe("No se pudo validar el código QR");
        expect(mocks.visit).not.toHaveBeenCalled();
        expect(mocks.log).not.toHaveBeenCalled();
    });
    it("keeps committed success if display data and logging fail", async () => {
        mocks.visit.mockRejectedValue(new Error("private query detail"));
        mocks.log.mockRejectedValue(new Error("private log detail"));
        expect((await contract(await POST(request({ token, usuario_id: 999 })), 200, "valido")).data).toBeNull();
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(mocks.log).toHaveBeenCalledWith(7, "Validó acceso QR");
    });
});
