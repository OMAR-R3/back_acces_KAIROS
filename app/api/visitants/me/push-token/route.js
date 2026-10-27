export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { checkRateLimit } from "@/middlewares/rateLimit";
import { upsertPushToken, deletePushToken } from "@/services/pushTokenService";

// POST /api/visitants/me/push-token
// Registra el token push del dispositivo del visitante autenticado.
// DELETE /api/visitants/me/push-token
// Borra ese token (al cerrar sesión en la app).
// El visitante_id sale del JWT, nunca del body.

const TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;
const PLATAFORMAS = ["android", "ios"];

function bad(message, status = 400) {
    return NextResponse.json({ success: false, error: message }, { status });
}

async function leerBody(req) {
    try {
        return await req.json();
    } catch {
        return null;
    }
}

export async function POST(req) {
    try {
        const payload = checkRole(req, ["visitante"]);
        checkRateLimit(req, { keySuffix: "push-token-registrar", max: 20 });

        const body = await leerBody(req);
        if (!body) return bad("Cuerpo de la solicitud inválido");

        const token = typeof body.token === "string" ? body.token.trim() : "";
        const plataforma = typeof body.plataforma === "string" ? body.plataforma.trim().toLowerCase() : "";

        if (!TOKEN_REGEX.test(token)) return bad("Token push inválido");
        if (!PLATAFORMAS.includes(plataforma)) {
            return bad("Plataforma inválida, usa android o ios");
        }

        await upsertPushToken({ visitante_id: payload.id, token, plataforma });

        return NextResponse.json({ success: true });

    } catch (error) {
        if (error?.status && error.status < 500) {
            return bad(error.message, error.status);
        }
        console.error("POST /api/visitants/me/push-token:", error);
        return bad("No se pudo registrar el token", 500);
    }
}

export async function DELETE(req) {
    try {
        const payload = checkRole(req, ["visitante"]);
        checkRateLimit(req, { keySuffix: "push-token-borrar", max: 20 });

        const body = await leerBody(req);
        if (!body) return bad("Cuerpo de la solicitud inválido");

        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!TOKEN_REGEX.test(token)) return bad("Token push inválido");

        await deletePushToken({ visitante_id: payload.id, token });

        return NextResponse.json({ success: true });

    } catch (error) {
        if (error?.status && error.status < 500) {
            return bad(error.message, error.status);
        }
        console.error("DELETE /api/visitants/me/push-token:", error);
        return bad("No se pudo borrar el token", 500);
    }
}