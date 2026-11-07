import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ visit: vi.fn() }));
vi.mock("@/middlewares/auth", () => ({ checkRole: () => ({ id: 7, rol: "visitante" }) }));
vi.mock("@/middlewares/rateLimit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/services/visitService", () => ({ getVisitQRByIdAndVisitanteId: mocks.visit }));
import { GET } from "../../app/api/visits/me/[id]/qr/route.js";

afterEach(() => vi.useRealTimers());
describe("visitor QR date compatibility", () => {
    it.each(["2026-11-07", "2026-11-07T00:00:00+00:00", "2026-11-07 00:00:00+00:00", "2026-11-07T23:59:59.123456-08:00"])("returns the same window for %s", async fecha => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-07T06:10:45Z"));
        mocks.visit.mockResolvedValue({ id: 1, estado: "aprobada", qr_code: "token",
            fecha, hora_inicio: "00:10:45", Accesos_QR: [] });
        const res = await GET(new Request("https://example.com/api/visits/me/1/qr"), { params: Promise.resolve({ id: "1" }) });
        expect(res.status).toBe(200);
        expect((await res.json()).data).toMatchObject({ qr: "token", estado_qr: "valido",
            vigente_desde: "2026-11-07T05:40:45.000Z", vigente_hasta: "2026-11-07T06:40:45.000Z" });
    });
});
