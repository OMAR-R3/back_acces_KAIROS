export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getVisitsByCorreo } from "@/services/visitService";

/*
  GET /api/visits/lookup?correo=ejemplo@correo.com
  
  Ruta pública — no requiere auth
  Devuelve todas las visitas asociadas al correo
*/
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const correo = searchParams.get("correo")?.trim().toLowerCase();

        if (!correo) {
            return NextResponse.json(
                { error: "El correo es requerido" },
                { status: 400 }
            );
        }

        const visitas = await getVisitsByCorreo(correo);

        return NextResponse.json({ success: true, data: visitas });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}