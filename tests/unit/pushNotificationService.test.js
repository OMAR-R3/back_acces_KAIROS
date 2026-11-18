import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    from: vi.fn(), query: vi.fn(), update: vi.fn(), read: vi.fn(), reread: vi.fn(), history: vi.fn(),
    approval: vi.fn(), cancellation: vi.fn(), log: vi.fn()
}));
vi.mock("../../db/supabaseClient.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../../utils/qrGenerator.js", () => ({ generateQR: vi.fn(async () => "image"), generateQRToken: vi.fn(() => "qr") }));
vi.mock("../../services/emailService.js", () => ({ sendApprovalEmail: mocks.approval, sendCancellationEmail: mocks.cancellation }));
vi.mock("@/services/logService.js", () => ({ createLog: mocks.log }));

import { sendVisitStatusPush } from "../../services/pushNotificationService.js";
import { updateVisitStatus } from "../../services/visitService.js";

const token = "ExpoPushToken[abcdefghij12345]";
const secondToken = "ExpoPushToken[abcdefghij67890]";
const unregistered = { status: "error", details: { error: "DeviceNotRegistered" } };
const accepted = { status: "ok", id: "ticket" };
let visit;
let fetchMock;
let tokenFilter;
let deleteTokenFilter;
let deleteVisitorFilter;
let deleteRequest;
beforeEach(() => {
    vi.resetAllMocks();
    visit = {
        id: 42, visitante_id: 7, estado: "pendiente", fecha: "2026-10-29", qr_code: null,
        Visitantes: { nombre: "Ana", correo: "ana@example.com" }
    };
    tokenFilter = vi.fn(() => ({ abortSignal: mocks.query }));
    deleteRequest = vi.fn().mockResolvedValue({ error: null });
    deleteVisitorFilter = vi.fn(() => ({ abortSignal: deleteRequest }));
    deleteTokenFilter = vi.fn(() => ({ eq: deleteVisitorFilter }));
    mocks.query.mockResolvedValue({ data: [{ token }], error: null });
    mocks.read.mockImplementation(async () => ({ data: visit ? { ...visit } : null, error: null }));
    mocks.reread.mockImplementation(async () => ({ data: visit ? { estado: visit.estado } : null, error: null }));
    // Simula un único UPDATE atómico: comprueba los filtros al ejecutarlo,
    // y solo devuelve una fila si pudo modificarla.
    mocks.update.mockImplementation(async (values, id, previousState) => {
        if (!visit || String(visit.id) !== String(id) || visit.estado !== previousState) {
            return { data: null, error: null };
        }
        Object.assign(visit, values);
        return { data: { id: visit.id }, error: null };
    });
    mocks.history.mockResolvedValue({ error: null });
    mocks.from.mockImplementation(table => {
        if (table === "Dispositivos_Push") {
            return {
                select: () => ({ eq: tokenFilter }),
                delete: () => ({ eq: deleteTokenFilter }),
            };
        }
        if (table === "Historial_Estados") return { insert: mocks.history };
        return {
            select: () => ({ eq: () => ({ single: mocks.read, maybeSingle: mocks.reread }) }),
            update: values => ({
                eq: (idColumn, id) => {
                    expect(idColumn).toBe("id");
                    return {
                        eq: (stateColumn, previousState) => {
                            expect(stateColumn).toBe("estado");
                            return {
                                select: columns => {
                                    expect(columns).toBe("id");
                                    return { maybeSingle: () => mocks.update(values, id, previousState) };
                                }
                            };
                        }
                    };
                }
            }),
        };
    });
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: "ok", id: "ticket" }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => { });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("notificaciones push de cambios de estado", () => {
    it("pasa la hora local de la visita al correo de aprobación", async () => {
        visit.hora_inicio = "23:45:00";
        await updateVisitStatus("42", { estado: "aprobada" }, 3);
        expect(mocks.approval).toHaveBeenCalledWith(expect.objectContaining({
            date: "2026-10-29", time: "23:45:00",
        }));
    });
    it("pasa la fecha y hora originales al correo de cancelación", async () => {
        visit.fecha = "2027-01-01";
        visit.hora_inicio = "00:15:00";
        await updateVisitStatus("42", { estado: "cancelada", motivo: "Cambio" }, 3);
        expect(mocks.cancellation).toHaveBeenCalledExactlyOnceWith({
            email: "ana@example.com", name: "Ana", date: "2027-01-01", time: "00:15:00", motivo: "Cambio",
        });
    });
    it.each([
        ["elimina el token de un dispositivo no registrado", unregistered, true],
        ["conserva el token ante otro error de Expo", { status: "error", details: { error: "MessageTooBig" } }, false],
        ["conserva el token cuando Expo acepta el envío", accepted, false],
    ])("%s", async (_, ticket, shouldDelete) => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [ticket] }) });

        await sendVisitStatusPush({ ...visit, estado: "aprobada" });

        expect(deleteTokenFilter.mock.calls).toEqual(shouldDelete ? [["token", token]] : []);
        expect(deleteVisitorFilter.mock.calls).toEqual(shouldDelete ? [["visitante_id", 7]] : []);
    });

    it("conserva la asociación entre cada ticket y su token en lotes mixtos", async () => {
        const tokens = Array.from({ length: 101 }, (_, index) => `ExpoPushToken[abcdefghij${index}]`);
        mocks.query.mockResolvedValue({ data: tokens.map(value => ({ token: value })) });
        const firstBatch = Array(100).fill(accepted);
        firstBatch[0] = { status: "error", details: { error: "MessageRateExceeded" } };
        firstBatch[17] = unregistered;
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: firstBatch }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [unregistered] }) });

        await sendVisitStatusPush({ ...visit, estado: "aprobada" });

        expect(fetchMock.mock.calls.flatMap(([, options]) =>
            JSON.parse(options.body).map(message => message.to))).toEqual(tokens);
        expect(deleteTokenFilter.mock.calls).toEqual([["token", tokens[17]], ["token", tokens[100]]]);
    });

    it("omite el borrado si la cantidad de tickets impide asociarlos con certeza", async () => {
        mocks.query.mockResolvedValue({ data: [{ token }, { token: secondToken }] });
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [unregistered] }) });

        await sendVisitStatusPush({ ...visit, estado: "aprobada" });

        expect(deleteTokenFilter).not.toHaveBeenCalled();
    });

    it.each(["respuesta de Supabase", "rechazo de la consulta"])(
        "continúa limpiando los demás tokens ante un fallo de borrado por %s", async failure => {
            mocks.query.mockResolvedValue({ data: [{ token }, { token: secondToken }] });
            fetchMock.mockResolvedValue({
                ok: true, json: async () => ({ data: [unregistered, unregistered] }),
            });
            if (failure === "respuesta de Supabase") {
                deleteRequest.mockResolvedValueOnce({ error: { message: token } });
            } else {
                deleteRequest.mockRejectedValueOnce(new Error(token));
            }

            await expect(sendVisitStatusPush({ ...visit, estado: "aprobada" })).resolves.toBeUndefined();

            expect(deleteTokenFilter.mock.calls).toEqual([["token", token], ["token", secondToken]]);
            expect(deleteRequest).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenCalledWith(
                "Push: no se pudo eliminar un token inválido", { visita_id: 42 },
            );
            expect(JSON.stringify(console.error.mock.calls)).not.toContain(token);
        },
    );

    it.each([
        ["aprobada", "Visita aprobada", "Tu visita KV-000042 fue aprobada. Consulta los detalles en Mis visitas."],
        ["cancelada", "Visita cancelada", "Tu visita KV-000042 fue cancelada. Revisa los detalles en Mis visitas."],
    ])("envía el texto oficial para %s y conserva correo, historial y log", async (estado, title, body) => {
        await expect(updateVisitStatus("42", { estado, motivo: "Cambio" }, 3))
            .resolves.toEqual({ id: "42", estado, motivo: "Cambio" });
        expect(tokenFilter).toHaveBeenCalledWith("visitante_id", 7);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([{ to: token, title, body, data: { visita_id: 42 } }]);
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ estado }), "42", "pendiente");
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(estado === "aprobada" ? mocks.approval : mocks.cancellation).toHaveBeenCalledOnce();
        expect(mocks.from).toHaveBeenCalledWith("Historial_Estados");
        expect(mocks.log).toHaveBeenCalled();
    });
    it("omite visitantes sin tokens", async () => {
        mocks.query.mockResolvedValue({ data: [], error: null });
        await sendVisitStatusPush({ ...visit, estado: "aprobada" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
    });
    it("filtra tokens inválidos y duplicados", async () => {
        mocks.query.mockResolvedValue({ data: [{ token }, { token }, { token: "invalid" }, { token: null }], error: null });
        await sendVisitStatusPush({ ...visit, estado: "aprobada" });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveLength(1);
    });
    it("divide más de cien tokens en lotes válidos", async () => {
        mocks.query.mockResolvedValue({
            data: Array.from({ length: 101 }, (_, index) => ({
                token: `ExponentPushToken[abcdefghij${index}]`,
            })), error: null
        });
        fetchMock.mockImplementation(async (_, options) => ({
            ok: true, json: async () => ({
                data: JSON.parse(options.body).map(() => ({ status: "ok", id: "ticket" })),
            })
        }));
        await sendVisitStatusPush({ ...visit, estado: "aprobada" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).length)).toEqual([100, 1]);
    });
    it("no consulta tokens para otros estados", async () => {
        await sendVisitStatusPush({ ...visit, estado: "finalizada" });
        expect(mocks.query).not.toHaveBeenCalled();
    });
    it.each(["red", "http", "tickets", "consulta", "json", "respuesta"])("conserva el estado y correo ante fallo de %s", async failure => {
        if (failure === "red") fetchMock.mockRejectedValue(new Error(token));
        if (failure === "http") fetchMock.mockResolvedValue({ ok: false, status: 503 });
        if (failure === "tickets") fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "error", message: token }] }) });
        if (failure === "consulta") mocks.query.mockResolvedValue({ error: { message: token } });
        if (failure === "json") fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error(token); } });
        if (failure === "respuesta") fetchMock.mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: token }] }) });
        await expect(updateVisitStatus(42, { estado: "aprobada" }, 3)).resolves.toMatchObject({ estado: "aprobada" });
        expect(mocks.update).toHaveBeenCalled();
        expect(visit.estado).toBe("aprobada");
        expect(mocks.approval).toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
        expect(JSON.stringify(console.error.mock.calls)).not.toContain(token);
    });
    it("no notifica si falla guardar", async () => {
        mocks.update.mockResolvedValue({ error: { message: "update failed" } });
        await expect(updateVisitStatus(42, { estado: "aprobada" }, 3)).rejects.toThrow("update failed");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.approval).not.toHaveBeenCalled();
    });
    it.each(["aprobada", "cancelada"])("no repite push ni correo si el estado ya es %s", async estado => {
        visit.estado = estado;
        await updateVisitStatus(42, { estado, motivo: "Cambio" }, 3);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.approval).not.toHaveBeenCalled();
        expect(mocks.cancellation).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.history).not.toHaveBeenCalled();
    });
    it.each(["aprobada", "cancelada"])("dos solicitudes simultáneas a %s generan un push y un correo", async estado => {
        const snapshots = [];
        mocks.read.mockImplementation(() => new Promise(resolve => {
            snapshots.push({ resolve, data: { ...visit } });
            // Barrera de lectura: ambas solicitudes leen el mismo estado anterior
            // antes de permitir que cualquiera intente actualizarlo.
            if (snapshots.length === 2) snapshots.forEach(item => item.resolve({ data: item.data, error: null }));
        }));
        const results = await Promise.all([
            updateVisitStatus(42, { estado, motivo: "Cambio" }, 3),
            updateVisitStatus(42, { estado, motivo: "Cambio" }, 4),
        ]);
        expect(results).toEqual(Array(2).fill({ id: 42, estado, motivo: "Cambio" }));
        expect(mocks.update).toHaveBeenCalledTimes(2);
        expect(mocks.update.mock.calls.every(([, , previous]) => previous === "pendiente")).toBe(true);
        expect(visit.estado).toBe(estado);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(estado === "aprobada" ? mocks.approval : mocks.cancellation).toHaveBeenCalledOnce();
        expect(estado === "aprobada" ? mocks.cancellation : mocks.approval).not.toHaveBeenCalled();
        expect(mocks.history).toHaveBeenCalledOnce();
        expect(mocks.log).toHaveBeenCalledOnce();
    });
    it.each([
        [null, "Visita no encontrada", undefined],
        [{ estado: "cancelada" }, "El estado de la visita cambió", 409],
        [{ estado: "pendiente" }, "El estado de la visita cambió", 409],
    ])("clasifica un UPDATE sin filas con estado actual %j", async (current, message, status) => {
        mocks.update.mockResolvedValue({ data: null, error: null });
        mocks.reread.mockResolvedValue({ data: current, error: null });
        const result = updateVisitStatus(42, { estado: "aprobada" }, 3);
        await expect(result).rejects.toThrow(message);
        if (status) await expect(result).rejects.toMatchObject({ status });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.approval).not.toHaveBeenCalled();
        expect(mocks.history).not.toHaveBeenCalled();
        expect(mocks.log).not.toHaveBeenCalled();
    });
    it("propaga el fallo de la relectura sin notificar", async () => {
        mocks.update.mockResolvedValue({ data: null, error: null });
        mocks.reread.mockResolvedValue({ data: null, error: { message: "read failed" } });
        await expect(updateVisitStatus(42, { estado: "aprobada" }, 3)).rejects.toThrow("read failed");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.approval).not.toHaveBeenCalled();
    });
    it("no envía push ni correo al finalizar", async () => {
        await updateVisitStatus(42, { estado: "finalizada" }, 3);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.approval).not.toHaveBeenCalled();
        expect(mocks.cancellation).not.toHaveBeenCalled();
    });
    it.each(["consulta", "Expo"])("limita la espera de %s a cinco segundos", async stage => {
        vi.useFakeTimers();
        if (stage === "consulta") mocks.query.mockImplementation(() => new Promise(() => { }));
        else fetchMock.mockImplementation(() => new Promise(() => { }));
        const result = updateVisitStatus(42, { estado: "aprobada" }, 3);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(result).resolves.toMatchObject({ estado: "aprobada" });
        expect(mocks.approval).toHaveBeenCalled();
    });
    it("el fallo del correo no impide el push ni el resultado", async () => {
        mocks.approval.mockRejectedValue(new Error("SMTP failed"));
        await expect(updateVisitStatus(42, { estado: "aprobada" }, 3)).resolves.toMatchObject({ estado: "aprobada" });
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});


describe("acción rechazar", () => {
    it("rechaza una visita pendiente, guarda historial y log, manda push y no manda correo", async () => {
        await expect(updateVisitStatus("42", { estado: "rechazada", motivo: "Sin cupo" }, 3))
            .resolves.toEqual({ id: "42", estado: "rechazada", motivo: "Sin cupo" });
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ estado: "rechazada" }), "42", "pendiente");
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([{
            to: token,
            title: "Visita rechazada",
            body: "Tu visita KV-000042 fue rechazada. Revisa los detalles en Mis visitas.",
            data: { visita_id: 42 },
        }]);
        expect(mocks.history).toHaveBeenCalledWith([
            expect.objectContaining({ estado_nuevo: "rechazada", motivo: "Sin cupo" }),
        ]);
        expect(mocks.log).toHaveBeenCalledWith(3, expect.stringContaining("ID 42"));
        expect(mocks.approval).not.toHaveBeenCalled();
        expect(mocks.cancellation).not.toHaveBeenCalled();
    });

    it("exige motivo para rechazar", async () => {
        await expect(updateVisitStatus("42", { estado: "rechazada", motivo: "  " }, 3))
            .rejects.toThrow("El motivo es requerido para rechazar una visita");
        expect(mocks.update).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("no deja rechazar una visita que no está pendiente", async () => {
        visit.estado = "aprobada";
        await expect(updateVisitStatus("42", { estado: "rechazada", motivo: "Sin cupo" }, 3))
            .rejects.toMatchObject({ status: 409, message: "Solo se puede rechazar una visita pendiente" });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rechazar una visita ya rechazada no repite el push", async () => {
        visit.estado = "rechazada";
        await expect(updateVisitStatus("42", { estado: "rechazada", motivo: "Sin cupo" }, 3))
            .resolves.toEqual({ id: "42", estado: "rechazada", motivo: "Sin cupo" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
