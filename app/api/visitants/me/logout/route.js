export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { checkRateLimit } from "@/middlewares/rateLimit";
import { revocarSesion, limpiarSesionesExpiradas } from "@/services/sesionVisitanteService";
export async function POST(req) {
    try {
        const payload = checkRole(req, ["visitante"]);
        checkRateLimit(req, { keySuffix: "visitante-logout", max: 20 });

        if (payload.jti) {
            await revocarSesion({ jti: payload.jti, visitante_id: payload.id, exp: payload.exp });
        }
        limpiarSesionesExpiradas().catch(() => { });

        return NextResponse.json({ success: true, revocada: Boolean(payload.jti) });

    } catch (error) {
        if (error?.status && error.status < 500) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }
        console.error("POST /api/visitants/me/logout:", error);
        return NextResponse.json({ success: false, error: "No se pudo cerrar la sesión" }, { status: 500 });
    }
}