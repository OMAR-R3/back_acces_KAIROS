import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
    process.env.JWT_SECRET = "secreto-de-prueba-hu7-0123456789-abcdef";
});

const servicio = vi.hoisted(() => ({
    revocarSesion: vi.fn(),
    sesionRevocada: vi.fn(),
    limpiarSesionesExpiradas: vi.fn(),
}));

vi.mock("@/services/sesionVisitanteService", () => servicio);
vi.mock("@/middlewares/rateLimit", () => ({ checkRateLimit: vi.fn() }));

import { signToken, verifyToken } from "@/utils/jwt";
import { verificarSesionVisitante } from "@/middlewares/sesionVisitante";
import { POST as logout } from "@/app/api/visitants/me/logout/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";

const JTI = "11111111-1111-4111-8111-111111111111";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const tokenVisitante = (opciones = { jwtid: JTI }) =>
    signToken(
        { id: 7, rol: "visitante", correo: "visitante@utsjr.edu.mx", dispositivo: "android" },
        opciones,
    );

const tokenPersonal = () =>
    signToken({ id: 3, nombre: "Admin", rol: "administrador", dispositivo: "web" });

const peticion = token =>
    new Request("http://localhost/api/prueba", {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
    });

beforeEach(() => {
    vi.clearAllMocks();
    servicio.revocarSesion.mockResolvedValue(undefined);
    servicio.sesionRevocada.mockResolvedValue(false);
    servicio.limpiarSesionesExpiradas.mockResolvedValue(undefined);
});

describe("signToken con jti", () => {
    it("incluye el jti cuando se pide", () => {
        expect(verifyToken(tokenVisitante()).jti).toBe(JTI);
    });

    it("no agrega jti si no se pide", () => {
        expect(verifyToken(tokenPersonal()).jti).toBeUndefined();
    });
});

describe("verificarSesionVisitante", () => {
    it("deja pasar un token sin jti sin consultar la base de datos", async () => {
        const payload = { id: 7, rol: "visitante" };
        await expect(verificarSesionVisitante(payload)).resolves.toBe(payload);
        expect(servicio.sesionRevocada).not.toHaveBeenCalled();
    });

    it("deja pasar un jti que no está revocado", async () => {
        const payload = { id: 7, rol: "visitante", jti: JTI };
        await expect(verificarSesionVisitante(payload)).resolves.toBe(payload);
        expect(servicio.sesionRevocada).toHaveBeenCalledWith(JTI);
    });

    it("rechaza con 401 un jti revocado", async () => {
        servicio.sesionRevocada.mockResolvedValue(true);
        await expect(verificarSesionVisitante({ jti: JTI })).rejects.toMatchObject({
            status: 401,
            message: "Sesión cerrada",
        });
    });

    it("rechaza con 503 si falla la base de datos (no deja pasar)", async () => {
        servicio.sesionRevocada.mockRejectedValue(new Error("db caída"));
        await expect(verificarSesionVisitante({ jti: JTI })).rejects.toMatchObject({ status: 503 });
    });
});

describe("POST /api/visitants/me/logout", () => {
    it("revoca la sesión del token con el que se llama", async () => {
        const res = await logout(peticion(tokenVisitante()));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, revocada: true });
        expect(servicio.revocarSesion).toHaveBeenCalledWith({
            jti: JTI,
            visitante_id: 7,
            exp: expect.any(Number),
        });
    });

    it("con un token anterior a HU-7 (sin jti) responde 200 con revocada: false", async () => {
        const res = await logout(peticion(tokenVisitante({})));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, revocada: false });
        expect(servicio.revocarSesion).not.toHaveBeenCalled();
    });

    it("sin token responde 401 y no revoca nada", async () => {
        const res = await logout(peticion(null));
        expect(res.status).toBe(401);
        expect(servicio.revocarSesion).not.toHaveBeenCalled();
    });

    it("un token del personal responde 403", async () => {
        const res = await logout(peticion(tokenPersonal()));
        expect(res.status).toBe(403);
        expect(servicio.revocarSesion).not.toHaveBeenCalled();
    });

    it("si falla la base de datos responde 500 sin filtrar el detalle", async () => {
        vi.spyOn(console, "error").mockImplementation(() => { });
        servicio.revocarSesion.mockRejectedValue(new Error("detalle interno"));
        const res = await logout(peticion(tokenVisitante()));
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("detalle interno");
    });
});

describe("POST /api/auth/refresh", () => {
    it("conserva el jti y el correo del visitante", async () => {
        const res = await refresh(peticion(tokenVisitante()));
        expect(res.status).toBe(200);
        const nuevo = verifyToken((await res.json()).token);
        expect(nuevo.jti).toBe(JTI);
        expect(nuevo.correo).toBe("visitante@utsjr.edu.mx");
        expect(nuevo.id).toBe(7);
    });

    it("a un token de visitante anterior a HU-7 le asigna un jti nuevo", async () => {
        const res = await refresh(peticion(tokenVisitante({})));
        const nuevo = verifyToken((await res.json()).token);
        expect(nuevo.jti).toMatch(UUID_REGEX);
    });

    it("no renueva una sesión cerrada", async () => {
        servicio.sesionRevocada.mockResolvedValue(true);
        const res = await refresh(peticion(tokenVisitante()));
        expect(res.status).toBe(401);
        expect((await res.json()).token).toBeUndefined();
    });

    it("el token del personal se renueva igual que antes, sin jti ni consulta", async () => {
        const res = await refresh(peticion(tokenPersonal()));
        expect(res.status).toBe(200);
        expect(verifyToken((await res.json()).token).jti).toBeUndefined();
        expect(servicio.sesionRevocada).not.toHaveBeenCalled();
    });
});