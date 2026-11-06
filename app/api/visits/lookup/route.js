export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getVisitsByCorreo } from "@/services/visitService";
import { checkRateLimit } from "@/middlewares/rateLimit";
import { lookupMode, lookupHeaders, validLookupCorreo } from "@/utils/lookupPolicy";

const WINDOW_MS = 15 * 60 * 1000;
const headers = lookupHeaders;
const json = (body, status = 200) => NextResponse.json(body, { status, headers });

/*
  GET /api/visits/lookup?correo=ejemplo@correo.com
  legacy/prepare preserve anonymous access (privacy vulnerability remains).
  enforced requires a dedicated lookup credential for this exact email.
*/
export async function GET(req) {
    // Count invalid requests too, and use a fixed suffix so changing the email
    // does not provide a fresh quota. This is abuse mitigation, not identity proof.
    try {
        checkRateLimit(req, { keySuffix: "visitas-lookup", max: 30, windowMs: WINDOW_MS });
    } catch {
        return NextResponse.json(
            { error: "Demasiadas solicitudes, intenta más tarde" },
            { status: 429, headers: { ...headers, "Retry-After": String(WINDOW_MS / 1000) } }
        );
    }

    try {
        const { searchParams } = new URL(req.url);
        const correos = searchParams.getAll("correo");
        const correo = correos[0]?.trim().toLowerCase();

        if (!correo) {
            return json({ error: "El correo es requerido" }, 400);
        }
        if (correos.length !== 1 || !validLookupCorreo(correo)) {
            return json({ error: "El correo no es válido" }, 400);
        }

        const mode = lookupMode(); // Unknown values fail closed through the catch.
        if (mode === "enforced") {
            const { authorizeLookup } = await import("@/services/lookupAccessService");
            if (!await authorizeLookup(req, correo)) {
                return json({ error: "Verifica tu correo para consultar las visitas" }, 401);
            }
        }

        const visitas = await getVisitsByCorreo(correo);

        // Keep the existing field contract until the web consumers can be audited.
        return json({ success: true, data: visitas });

    } catch {
        return json({ error: "No se pudieron consultar las visitas" }, 500);
    }
}
