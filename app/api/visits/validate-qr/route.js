export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkCheckerAuth } from "@/middlewares/checkerAuth";
import { checkRateLimit } from "@/middlewares/rateLimit";
import { consumeVisitQR } from "@/services/qrAccessService";

const statuses = { valido: 200, expirado: 422, utilizado: 409, invalido: 400 };
const reply = (resultado, status, extraHeaders = {}) => NextResponse.json(
    { success: resultado === "valido", resultado },
    { status, headers: { "Cache-Control": "no-store", ...extraHeaders } }
);

async function readToken(req) {
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
    if (!req.body) return null;
    const reader = req.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1024) {
                await reader.cancel();
                return null;
            }
            chunks.push(Buffer.from(value));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.token !== "string") return null;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.token) ? body.token.toLowerCase() : null;
    } catch {
        return null;
    } finally {
        reader.releaseLock();
    }
}

export async function POST(req) {
    try {
        // One bounded bucket per process, including failed authentication.
        // Never key this route on client-supplied forwarding headers or API keys.
        checkRateLimit({ headers: new Headers() }, {
            keySuffix: "validate-qr:global", max: 120, windowMs: 60_000,
        });
        checkCheckerAuth(req);
        const token = await readToken(req);
        if (!token) return reply("invalido", 400);
        const result = await consumeVisitQR(token);
        return reply(result, statuses[result]);
    } catch (error) {
        if (error?.status === 429) return reply("no_autorizado", 429, { "Retry-After": "60" });
        if (error?.status === 401) return reply("no_autorizado", 401);
        return reply("error_servicio", 503);
    }
}
