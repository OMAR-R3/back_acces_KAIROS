import { NextResponse } from "next/server";
import { checkRateLimit } from "../middlewares/rateLimit.js";
import { lookupHeaders, lookupMode, normalizeLookupCorreo, validLookupCorreo } from "./lookupPolicy.js";

const json = (body, status) => NextResponse.json(body, { status, headers: lookupHeaders });

async function readBody(req) {
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("Invalid body");
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Invalid body");
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2048) {
                await reader.cancel();
                throw new Error("Invalid body");
            }
            chunks.push(Buffer.from(value));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
        return body;
    } finally {
        reader.releaseLock();
    }
}

export async function lookupAccessHandler(req, action) {
    try {
        if (lookupMode() === "legacy") return json({ error: "Verificación no habilitada" }, 503);
    } catch {
        return json({ error: "Verificación no disponible" }, 503);
    }
    try {
        checkRateLimit(req, { keySuffix: `lookup-${action}`, max: action === "request" ? 5 : 20 });
    } catch {
        return NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, {
            status: 429, headers: { ...lookupHeaders, "Retry-After": "900" },
        });
    }
    let body;
    if (action !== "logout") {
        try { body = await readBody(req); }
        catch { return json({ error: "Solicitud inválida" }, 400); }
    }
    if (action === "request") {
        body.correo = normalizeLookupCorreo(body.correo);
        if (!validLookupCorreo(body.correo)) return json({ error: "El correo no es válido" }, 400);
    }
    try {
        const service = await import("../services/lookupAccessService.js");
        if (action === "request") {
            const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
            const challenge = await service.requestLookupCode(body.correo, ip);
            return json({ success: true, message: "Si la solicitud puede procesarse, recibirás un código", ...challenge }, 202);
        }
        if (action === "verify") {
            const session = await service.verifyLookupCode(body);
            return session ? json({ success: true, ...session }, 200)
                : json({ error: "Código inválido, agotado o expirado" }, 401);
        }
        await service.revokeLookup(req);
        return json({ success: true }, 200);
    } catch {
        return json({ error: "Verificación no disponible" }, 503);
    }
}
