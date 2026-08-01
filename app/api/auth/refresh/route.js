export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth } from "@/middlewares/auth";
import { signToken } from "@/utils/jwt";

/*
  POST /api/auth/refresh
  Renueva el token si aún es válido
  No requiere credenciales, solo el token actual
*/
export async function POST(req) {
    try {
        const payload = checkAuth(req);

        // Generar nuevo token con los mismos datos
        const nuevoToken = signToken({
            id: payload.id,
            nombre: payload.nombre,
            rol: payload.rol,
            dispositivo: payload.dispositivo
        });

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