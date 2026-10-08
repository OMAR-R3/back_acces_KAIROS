export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { checkRateLimit } from "@/middlewares/rateLimit";

import { createVisit } from "@/services/visitService";
import { supabase } from "@/db/supabaseClient";

// POST /api/visits/me
// Crea una visita para el visitante autenticado (token de visitante).
// El visitante_id sale del token, nunca del body.
// La visita queda "pendiente" y sin QR hasta que el personal la apruebe.

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function hoyMexico() {
    // en-CA da formato AAAA-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function fechaValida(fecha) {
    if (!FECHA_REGEX.test(fecha)) return false;
    const [y, m, d] = fecha.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
    );
}

function bad(message, status = 400) {
    return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req) {
    try {
        const payload = checkRole(req, ["visitante"]);

        checkRateLimit(req, { keySuffix: "visita-crear", max: 10 });

        let body;
        try {
            body = await req.json();
        } catch {
            return bad("Cuerpo de la solicitud inválido");
        }

        const depto_id = Number(body?.depto_id);
        const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";
        const hora_inicio = typeof body?.hora_inicio === "string" ? body.hora_inicio.trim() : "";
        const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";

        if (!Number.isInteger(depto_id) || depto_id <= 0) {
            return bad("Departamento inválido");
        }
        if (!fechaValida(fecha)) {
            return bad("Fecha inválida, usa el formato AAAA-MM-DD");
        }
        if (fecha < hoyMexico()) {
            return bad("La fecha no puede ser anterior a hoy");
        }
        if (!HORA_REGEX.test(hora_inicio)) {
            return bad("Hora inválida, usa el formato HH:MM");
        }
        if (!motivo) {
            return bad("El motivo es requerido");
        }
        if (motivo.length > 500) {
            return bad("El motivo no puede pasar de 500 caracteres");
        }

        const { data: depto, error: deptoError } = await supabase
            .from("Departamentos")
            .select("id")
            .eq("id", depto_id)
            .maybeSingle();

        if (deptoError) throw deptoError;
        if (!depto) return bad("El departamento no existe", 404);

        const visita = await createVisit({
            visitante_id: payload.id,
            depto_id,
            fecha,
            hora_inicio,
            motivo
        });

        // Historial inicial. No se tumba la visita si esto falla, solo se registra.
        const { error: histError } = await supabase
            .from("Historial_Estados")
            .insert({
                visita_id: visita.id,
                estado: visita.estado ?? "pendiente",
                usuario_id: null
            });

        if (histError) {
            console.error("Historial_Estados (visits/me):", histError.message);
        }

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: visita.id,
                    folio: "KV-" + String(visita.id).padStart(6, "0"),
                    estado: visita.estado ?? "pendiente",
                    depto_id,
                    fecha,
                    hora_inicio
                }
            },
            { status: 201 }
        );

    } catch (error) {
        if (error?.status && error.status < 500) {
            return bad(error.message, error.status);
        }
        console.error("POST /api/visits/me:", error);
        return bad("No se pudo crear la visita", 500);
    }
}