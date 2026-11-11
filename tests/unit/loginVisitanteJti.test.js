import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
    process.env.JWT_SECRET = "secreto-de-prueba-hu7-0123456789-abcdef";
});

const mocks = vi.hoisted(() => ({
    getVisitanteByCorreo: vi.fn(),
    compare: vi.fn(),
}));

vi.mock("@/db/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/services/visitorService", () => ({
    getVisitanteByCorreo: mocks.getVisitanteByCorreo,
    createVisitante: vi.fn(),
    updateVisitante: vi.fn(),
}));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: vi.fn() } }));

import { loginVisitante } from "@/services/authService";
import { verifyToken } from "@/utils/jwt";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VISITANTE = { id: 7, nombre: "Visitante", correo: "visitante@utsjr.edu.mx", password: "hash" };
const CREDENCIALES = { correo: "visitante@utsjr.edu.mx", password: "contraseña" };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVisitanteByCorreo.mockResolvedValue(VISITANTE);
    mocks.compare.mockResolvedValue(true);
});

describe("loginVisitante y el jti de la sesión", () => {
    it("emite un jti distinto en cada inicio de sesión (una sesión por dispositivo)", async () => {
        const a = verifyToken((await loginVisitante(CREDENCIALES, "android")).token);
        const b = verifyToken((await loginVisitante(CREDENCIALES, "android")).token);

        expect(a.jti).toMatch(UUID_REGEX);
        expect(b.jti).toMatch(UUID_REGEX);
        expect(a.jti).not.toBe(b.jti);
        expect(a).toMatchObject({ id: 7, rol: "visitante", correo: VISITANTE.correo, dispositivo: "android" });
    });

    it("con contraseña incorrecta responde 401 y no entrega token", async () => {
        mocks.compare.mockResolvedValue(false);
        await expect(loginVisitante(CREDENCIALES)).rejects.toMatchObject({ status: 401 });
    });

    it("un visitante sin contraseña (visita anónima) no puede iniciar sesión", async () => {
        mocks.getVisitanteByCorreo.mockResolvedValue({ ...VISITANTE, password: "" });
        await expect(loginVisitante(CREDENCIALES)).rejects.toMatchObject({ status: 401 });
        expect(mocks.compare).not.toHaveBeenCalled();
    });
});