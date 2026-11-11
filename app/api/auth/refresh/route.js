export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth } from "@/middlewares/auth";
import { signToken } from "@/utils/jwt";
import { randomUUID } from "node:crypto";
import { verificarSesionVisitante } from "@/middlewares/sesionVisitante";

export async function POST(req) {
    try {
        const payload = checkAuth(req);
        const esVisitante = payload.rol === "visitante";

        // Una sesión cerrada ya no se puede renovar
        if (esVisitante) await verificarSesionVisitante(payload);

        const jwtid = esVisitante ? (payload.jti || randomUUID()) : undefined;

        const nuevoToken = signToken({
            id: payload.id,
            nombre: payload.nombre,
            rol: payload.rol,
            ...(payload.correo ? { correo: payload.correo } : {}),
            dispositivo: payload.dispositivo
        }, { jwtid });

        const response = NextResponse.json(
            { success: true, token: nuevoToken },
            { status: 200 }
        );

        response.cookies.set("auth_token", nuevoToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 60 * 60 * 8
        });

        return response;

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 401 }
        );
    }
}