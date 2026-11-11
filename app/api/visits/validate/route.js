export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { consumeVisitQR } from "@/services/qrAccessService";
import { validateQR } from "@/services/visitService";
import { createLog } from "@/services/logService";

const statuses = { valido: 200, invalido: 400, expirado: 422, utilizado: 409 };
const messages = {
    invalido: "QR no válido", expirado: "QR expirado", utilizado: "QR ya utilizado",
    no_autorizado: "No autenticado", prohibido: "No tienes permisos para esta acción",
    error_servicio: "No se pudo validar el código QR",
};
const reply = (resultado, status, data = null) => {
    const valid = resultado === "valido";
    return NextResponse.json({
        success: valid, valid, resultado,
        ...(valid ? { data } : { error: messages[resultado] }),
    }, { status, headers: { "Cache-Control": "no-store" } });
};

export async function POST(req) {
    let payload;
    try {
        payload = checkRole(req, ["guardia", "recepcionista", "administrador"]);
    } catch (error) {
        if (error?.status === 401) return reply("no_autorizado", 401);
        if (error?.status === 403) return reply("prohibido", 403);
        return reply("error_servicio", 503);
    }
    let body;
    try { body = await req.json(); }
    catch { return reply("invalido", 400); }
    if (!body || Array.isArray(body) || typeof body.token !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.token)) {
        return reply("invalido", 400);
    }
    const token = body.token.toLowerCase();
    let result;
    try {
        // PostgreSQL alone decides approval, time window and atomic single use.
        result = await consumeVisitQR(token);
        if (!Object.hasOwn(statuses, result)) return reply("error_servicio", 503);
    } catch { return reply("error_servicio", 503); }
    if (result !== "valido") return reply(result, statuses[result]);

    // Preserve legacy display data. Ancillary failures after commit must not
    // turn a granted access into a misleading failure and retry.
    let visita = null;
    try { visita = await validateQR(token); }
    catch { /* The RPC has already committed the access. */ }
    if (body.usuario_id) {
        try {
            await createLog(payload.id, visita
                ? `Validó acceso QR de visita ID ${visita.id} — ${visita.Visitantes?.nombre}`
                : "Validó acceso QR");
        } catch { /* Logging remains best effort. */ }
    }
    return reply("valido", 200, visita);
}
