import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), visitor: vi.fn(), visits: vi.fn(),
    visitorEq: vi.fn(), visitEq: vi.fn(), visitorSelect: vi.fn(), visitSelect: vi.fn(), order: vi.fn() }));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../../utils/qrGenerator.js", () => ({ generateQR: vi.fn(), generateQRToken: vi.fn() }));
vi.mock("../../services/emailService.js", () => ({ sendApprovalEmail: vi.fn(), sendCancellationEmail: vi.fn() }));
vi.mock("@/services/logService.js", () => ({ createLog: vi.fn() }));
vi.mock("../../services/pushNotificationService.js", () => ({ sendVisitStatusPush: vi.fn() }));
import { getVisitsByCorreo } from "../../services/visitService.js";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.visitor.mockResolvedValue({ data: { id: 8 }, error: null });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.visitorEq.mockReturnValue({ maybeSingle: mocks.visitor });
    mocks.visitorSelect.mockReturnValue({ eq: mocks.visitorEq });
    mocks.visitEq.mockReturnValue({ order: mocks.order });
    mocks.visitSelect.mockReturnValue({ eq: mocks.visitEq });
    mocks.from.mockImplementation(table => ({ select: table === "Visitantes" ? mocks.visitorSelect : mocks.visitSelect }));
});

describe("getVisitsByCorreo", () => {
    it("uses an explicit projection, visitor ownership filter and descending order", async () => {
        const data = [{ id: 42, estado: "pendiente", Departamentos: null }];
        mocks.order.mockResolvedValue({ data, error: null });
        await expect(getVisitsByCorreo("ana@example.com")).resolves.toEqual(data);
        expect(mocks.visitorSelect).toHaveBeenCalledWith("id");
        expect(mocks.visitorEq).toHaveBeenCalledWith("correo", "ana@example.com");
        expect(mocks.visitSelect.mock.calls[0][0].replace(/\s+/g, " ").trim()).toBe(
            "id, fecha, hora_inicio, motivo, estado, created_at, Departamentos (nombre, ubicacion)"
        );
        expect(mocks.visitEq).toHaveBeenCalledWith("visitante_id", 8);
        expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    });
    it("does not query visits when the visitor does not exist", async () => {
        mocks.visitor.mockResolvedValue({ data: null, error: null });
        await expect(getVisitsByCorreo("unknown@example.com")).resolves.toEqual([]);
        expect(mocks.from).toHaveBeenCalledExactlyOnceWith("Visitantes");
    });
    it("returns an empty list for a visitor with no visits", async () => {
        await expect(getVisitsByCorreo("ana@example.com")).resolves.toEqual([]);
    });
    it.each(["visitor", "visits"])("propagates %s failures for the route to sanitize", async stage => {
        (stage === "visitor" ? mocks.visitor : mocks.order).mockResolvedValue({ data: null, error: { message: "internal" } });
        await expect(getVisitsByCorreo("ana@example.com")).rejects.toThrow("internal");
    });
});
