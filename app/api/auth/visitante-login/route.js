export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loginVisitante } from "@/services/authService";
import { checkRateLimit } from "@/middlewares/rateLimit";

export async function POST(req) {
    try {
        checkRateLimit(req, { keySuffix: "visitante-login" });

        const body = await req.json();

        const userAgent = req.headers.get("user-agent") || "Dispositivo desconocido";
        const dispositivo = parseDispositivo(userAgent);

        const { token, visitante } = await loginVisitante(body, dispositivo);

        // OJO: no se registra en Logs_Acceso. Esa tabla tiene FK a
        // Usuarios_Internos, no a Visitantes - meter el id de un visitante
        // ahí tronaría la FK, o peor, quedaría contra un usuario interno
        // distinto si los ids llegan a coincidir.

        const response = NextResponse.json(
            {
                success: true,
                token,
                visitante: {
                    id: visitante.id,
                    nombre: visitante.nombre,
                    correo: visitante.correo,
                    dispositivo
                }
            },
            { status: 200 }
        );

        response.cookies.set("auth_token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
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