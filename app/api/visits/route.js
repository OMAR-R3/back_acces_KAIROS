export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { getAllVisits, getVisitById } from "@/services/visitService";

/*
  GET /api/visits              → lista con filtros opcionales
  GET /api/visits?id=X         → detalle de una visita con documentos
  GET /api/visits?estado=X     → filtrar por estado
  GET /api/visits?fecha=X      → filtrar por fecha
*/
export async function GET(req) {
    try {
        /*checkAuth(req);*/
        // reemplaza checkAuth(req) por:
        const payload = checkRole(req, ["guardia", "recepcionista", "administrador"]);

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const estado = searchParams.get("estado");
        const fecha = searchParams.get("fecha");
        const depto_id = searchParams.get("depto_id");

        if (id) {
            const visita = await getVisitById(id);
            return NextResponse.json({ success: true, data: visita });
        }

        const visitas = await getAllVisits({ estado, fecha, depto_id });
        return NextResponse.json({ success: true, data: visitas });

    } catch (error) {
        const status = error.status || 400;
        return NextResponse.json({ error: error.message }, { status });
    }
}