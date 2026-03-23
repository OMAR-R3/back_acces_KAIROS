export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loginUsuario } from "@/services/authService";
import { createLog } from "@/services/logService";

export async function POST(req) {
    try {
        const body = await req.json();
        const { token, usuario } = await loginUsuario(body);

        // Registrar log de acceso
        await createLog(
            usuario.id,
            `Inicio de sesión — rol: ${usuario.rol}`
        ).catch(err => console.error("Error en log:", err.message));

        // Guardar token en cookie HttpOnly
        const response = NextResponse.json(
            {
                success: true,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    rol: usuario.rol
                }
            },
            { status: 200 }
        );

        response.cookies.set("auth_token", token, {
            httpOnly: true,       // JS del frontend no puede leerla
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 8 // 8 horas en segundos
        });

        return response;

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}