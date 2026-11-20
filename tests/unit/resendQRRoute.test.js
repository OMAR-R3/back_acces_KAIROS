import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findVisit: vi.fn(), generateQR: vi.fn(), send: vi.fn() }));
vi.mock("@/db/supabaseClient", () => ({
    getSupabaseClient: () => ({
        from: () => ({
            select: () => ({
                eq: (_column, id) => ({ single: () => mocks.findVisit(id) }),
            }),
        }),
    }),
}));
vi.mock("@/utils/qrGenerator", () => ({ generateQR: mocks.generateQR }));
vi.mock("@/services/emailService", () => ({ resendQREmail: mocks.send }));

import { POST } from "../../app/api/visits/resend-qr/route.js";

const visit = (id, correo) => ({
    id,
    Visitantes: { correo, nombre: "Ana" },
    estado: "aprobada",
    qr_code: "stored-token",
    fecha: "2026-11-19",
    hora_inicio: "10:00:00",
});

let sequence = 0;
let ip;
let correo;
let id;

const request = (body, clientIp = ip) => new Request("http://localhost/api/visits/resend-qr", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
    body: JSON.stringify(body),
});
const resend = (visita_id = id, email = correo, clientIp = ip) =>
    POST(request({ visita_id, correo: email }, clientIp));

beforeEach(() => {
    sequence++;
    id = sequence * 100;
    ip = `resend-test-${sequence}`;
    correo = `ana${sequence}@example.com`;
    mocks.findVisit.mockReset().mockImplementation(async value => ({ data: visit(Number(value), correo) }));
    mocks.generateQR.mockReset().mockResolvedValue("qr-image");
    mocks.send.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe("POST /api/visits/resend-qr", () => {
    it.each(["legacy", "prepare", "enforced"])("resends publicly in %s mode", async mode => {
        vi.stubEnv("LOOKUP_ACCESS_MODE", mode);
        const res = await resend(id, correo.toUpperCase());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            success: true, message: "QR reenviado correctamente al correo registrado",
        });
        expect(mocks.generateQR).toHaveBeenCalledExactlyOnceWith("stored-token");
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
            email: correo, name: "Ana", date: "2026-11-19", time: "10:00:00", qrBase64: "qr-image",
        });
    });

    it("preserves validation responses without consuming resend quotas", async () => {
        expect((await POST(request({}))).status).toBe(400);
        mocks.findVisit.mockResolvedValueOnce({ data: null });
        expect((await resend()).status).toBe(404);
        expect((await resend(id, "other@example.com")).status).toBe(403);
        mocks.findVisit.mockResolvedValueOnce({ data: { ...visit(id, correo), estado: "pendiente" } });
        expect((await resend()).status).toBe(400);
        mocks.findVisit.mockResolvedValueOnce({ data: { ...visit(id, correo), qr_code: null } });
        expect((await resend()).status).toBe(400);
        expect(mocks.generateQR).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
        for (let attempt = 0; attempt < 3; attempt++) expect((await resend()).status).toBe(200);
    });

    it("limits a canonical visit ID across IPs even if the visit email changes", async () => {
        for (let attempt = 0; attempt < 3; attempt++) expect((await resend()).status).toBe(200);
        const updatedEmail = `updated-${correo}`;
        mocks.findVisit.mockResolvedValueOnce({ data: visit(id, updatedEmail) });
        expect((await resend(String(id), updatedEmail, `${ip}-other`)).status).toBe(429);
        expect(mocks.generateQR).toHaveBeenCalledTimes(3);
        expect(mocks.send).toHaveBeenCalledTimes(3);
    });

    it("limits an email across visits and IPs, including concurrent requests", async () => {
        const results = await Promise.all([0, 1, 2, 3].map(offset =>
            resend(id + offset, offset % 2 ? correo.toUpperCase() : correo, `${ip}-${offset}`)));
        expect(results.map(res => res.status).sort()).toEqual([200, 200, 200, 429]);
        expect(mocks.generateQR).toHaveBeenCalledTimes(3);
        expect(mocks.send).toHaveBeenCalledTimes(3);
    });

    it("limits all requests per IP, including invalid bodies, and renews after one hour", async () => {
        vi.useFakeTimers();
        const start = new Date("2026-11-19T12:00:00Z").getTime();
        vi.setSystemTime(start);
        for (let attempt = 0; attempt < 3; attempt++) expect((await resend()).status).toBe(200);
        for (let attempt = 0; attempt < 7; attempt++) expect((await POST(request({}))).status).toBe(400);

        vi.setSystemTime(start + 3_599_999);
        expect((await resend(id + 1)).status).toBe(429);
        expect(mocks.findVisit).toHaveBeenCalledTimes(3);
        expect(mocks.send).toHaveBeenCalledTimes(3);
        expect((await resend(id, correo, `${ip}-other`)).status).toBe(429);

        vi.setSystemTime(start + 3_600_000);
        expect((await resend()).status).toBe(200);
        expect(mocks.send).toHaveBeenCalledTimes(4);
    });
});
