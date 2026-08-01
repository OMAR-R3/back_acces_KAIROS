import { describe, it, expect, vi, beforeEach } from "vitest";

/* =========================================================
   MOCKS
   validateQR depende de supabase directamente, y el archivo
   visitService.js también importa qrGenerator, emailService
   y logService a nivel de módulo. Los simulamos todos para
   que cargar el archivo no dispare efectos secundarios reales
   (conexión a DB, envío de correos, generación de imágenes QR).
========================================================= */

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("../../db/supabaseClient.js", () => ({
    supabase: { from: fromMock },
}));

vi.mock("../../utils/qrGenerator.js", () => ({
    generateQR: vi.fn(),
    generateQRToken: vi.fn(),
}));

vi.mock("../../services/emailService.js", () => ({
    sendApprovalEmail: vi.fn(),
    sendCancellationEmail: vi.fn(),
}));

vi.mock("@/services/logService.js", () => ({
    createLog: vi.fn(),
}));

const { validateQR } = await import("../../services/visitService.js");

/* ========================================================= */

describe("validateQR (caja blanca)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("lanza 'QR no válido' cuando el token no existe en la base de datos", async () => {
        maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

        await expect(validateQR("token-inexistente")).rejects.toThrow("QR no válido");

        expect(fromMock).toHaveBeenCalledWith("Visitas");
        expect(eqMock).toHaveBeenCalledWith("qr_code", "token-inexistente");
    });

    it("lanza error con el estado actual cuando la visita no está aprobada", async () => {
        maybeSingleMock.mockResolvedValueOnce({
            data: {
                id: 1,
                estado: "pendiente",
                Visitantes: { nombre: "Juan Pérez", correo: "juan@example.com" },
                Departamentos: { nombre: "Recursos Humanos" },
            },
            error: null,
        });

        await expect(validateQR("token-pendiente")).rejects.toThrow(
            "Visita no está aprobada (estado actual: pendiente)"
        );
    });

    it("lanza error cuando la visita fue cancelada", async () => {
        maybeSingleMock.mockResolvedValueOnce({
            data: { id: 2, estado: "cancelada" },
            error: null,
        });

        await expect(validateQR("token-cancelado")).rejects.toThrow(
            "Visita no está aprobada (estado actual: cancelada)"
        );
    });

    it("devuelve los datos de la visita cuando el QR es válido y está aprobada", async () => {
        const visitaAprobada = {
            id: 3,
            estado: "aprobada",
            qr_code: "token-valido",
            Visitantes: { nombre: "Ana López", correo: "ana@example.com" },
            Departamentos: { nombre: "Sistemas" },
        };
        maybeSingleMock.mockResolvedValueOnce({ data: visitaAprobada, error: null });

        const resultado = await validateQR("token-valido");

        expect(resultado).toEqual(visitaAprobada);
    });

    it("propaga el mensaje de error si Supabase falla", async () => {
        maybeSingleMock.mockResolvedValueOnce({
            data: null,
            error: { message: "Error de conexión con la base de datos" },
        });

        await expect(validateQR("cualquier-token")).rejects.toThrow(
            "Error de conexión con la base de datos"
        );
    });
});