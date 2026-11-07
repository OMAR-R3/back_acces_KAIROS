import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCheckerAuth } from "../../middlewares/checkerAuth.js";
import { calcularVentanaQR, estadoVentana } from "../../utils/qrVigencia.js";

afterEach(() => vi.unstubAllEnvs());

describe("exclusive checker authentication", () => {
    it("rejects JWT/cookies without the dedicated key", () => {
        vi.stubEnv("CHECKER_API_KEY", "a".repeat(64));
        const req = new Request("https://example.com", { headers: { authorization: "Bearer jwt", cookie: "auth_token=jwt" } });
        expect(() => checkCheckerAuth(req)).toThrow("No autorizado");
    });
    it("accepts only the exact configured key", () => {
        vi.stubEnv("CHECKER_API_KEY", "a".repeat(64));
        expect(() => checkCheckerAuth(new Request("https://example.com", { headers: { "x-api-key": "a".repeat(64) } }))).not.toThrow();
        expect(() => checkCheckerAuth(new Request("https://example.com", { headers: { "x-api-key": "b" } }))).toThrow("No autorizado");
    });
    it("fails closed without server configuration", () => {
        vi.stubEnv("CHECKER_API_KEY", undefined);
        expect(() => checkCheckerAuth(new Request("https://example.com"))).toThrow("Servicio no disponible");
    });
});

describe("QR appointment window", () => {
    it.each(["2026-11-07T00:00:00Z", "2026-11-07T23:59:59.123456-08:00", "2026-11-07 00:00:00+00:00"])("preserves the legacy textual calendar day for %s", fecha => {
        expect(calcularVentanaQR(fecha, "00:10:45.123456")).toEqual(
            calcularVentanaQR("2026-11-07", "00:10:45.123456")
        );
    });
    it.each(["2026-02-30T00:00:00Z", "2026-11-07garbage", "2026-11-07T25:00:00Z"])("rejects invalid timestamp dates %s", fecha => {
        expect(calcularVentanaQR(fecha, "12:00")).toBeNull();
    });
    it("preserves seconds and crosses midnight with inclusive boundaries", () => {
        const window = calcularVentanaQR("2026-11-07", "00:10:45");
        expect(window.desde.toISOString()).toBe("2026-11-07T05:40:45.000Z");
        expect(window.hasta.toISOString()).toBe("2026-11-07T06:40:45.000Z");
        expect(estadoVentana(window, window.desde)).toBe("vigente");
        expect(estadoVentana(window, window.hasta)).toBe("vigente");
        expect(estadoVentana(window, new Date(+window.desde - 1))).toBe("antes");
        expect(estadoVentana(window, new Date(+window.hasta + 1))).toBe("expirado");
    });
    it("uses historical IANA offset instead of a fixed offset", () => {
        expect(calcularVentanaQR("2021-07-01", "12:00").desde.toISOString()).toBe("2021-07-01T16:30:00.000Z");
    });
    it.each([["2026-02-30", "12:00"], ["2026-11-07", "25:00"], ["bad", "12:00"]])("rejects invalid schedule %s %s", (date, time) => {
        expect(calcularVentanaQR(date, time)).toBeNull();
    });
});
