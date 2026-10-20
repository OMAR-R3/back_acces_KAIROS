import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { checkRateLimit } from "@/middlewares/rateLimit";
import { getVisitByIdAndVisitanteId } from "@/services/visitService";

const bad = (message, status) =>
    NextResponse.json({ success: false, error: message }, { status });

export async function GET(req, { params }) {
    try {
        const payload = checkRole(req, ["visitante"]);
        checkRateLimit(req, { keySuffix: "visitas-detalle", max: 60 });

        const { id } = await params;
        if (!/^\d+$/.test(id)) return bad("Visita no encontrada", 404);

        const v = await getVisitByIdAndVisitanteId(id, payload.id);
        if (!v) return bad("Visita no encontrada", 404);

        const data = {
            id: v.id,
            folio: "KV-" + String(v.id).padStart(6, "0"),
            estado: v.estado,
            fecha: typeof v.fecha === "string" ? v.fecha.slice(0, 10) : v.fecha,
            hora_inicio: v.hora_inicio,
            motivo: v.motivo ?? "",
            departamento: v.Departamentos
                ? {
                    id: v.Departamentos.id,
                    nombre: v.Departamentos.nombre,
                    ubicacion: v.Departamentos.ubicacion
                }
                : null
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        if (error?.status && error.status < 500) return bad(error.message, error.status);
        console.error("GET /api/visits/me/[id]:", error);
        return bad("No se pudo obtener la visita", 500);
    }
}