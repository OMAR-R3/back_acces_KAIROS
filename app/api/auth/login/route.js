export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loginUsuario } from "@/services/authService";
import { createLog } from "@/services/logService";

export async function POST(req) {
    try {
        const body = await req.json();

        // Obtener info del navegador
        const userAgent = req.headers.get("user-agent") || "Dispositivo desconocido";
        const dispositivo = parseDispositivo(userAgent);

        const { token, usuario } = await loginUsuario(body, dispositivo);

        await createLog(
            usuario.id,
            `Inicio de sesión desde ${dispositivo} — rol: ${usuario.rol}`
        ).catch(err => console.error("Error en log:", err.message));

        const response = NextResponse.json(
            {
                success: true,
                token,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    rol: usuario.rol,
                    dispositivo  // ← enviarlo al frontend
                }
            },
            { status: 200 }
        );

        response.cookies.set("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 8
        });

        return response;

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}

function parseDispositivo(userAgent) {
    if (/mobile/i.test(userAgent)) return "Móvil";
    if (/tablet/i.test(userAgent)) return "Tablet";
    if (/chrome/i.test(userAgent)) return "Chrome";
    if (/firefox/i.test(userAgent)) return "Firefox";
    if (/safari/i.test(userAgent)) return "Safari";
    if (/edg/i.test(userAgent)) return "Edge";
    return "Navegador desconocido";
}