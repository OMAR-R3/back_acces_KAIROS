export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { registerDocument } from "@/services/documentService";

// Solo para subidas manuales desde el admin
// El flujo público usa /api/visits/register que llama al service directo
export async function POST(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["recepcionista", "administrador"]);

        const formData = await req.formData();
        const file = formData.get("documento");
        const visita_id = formData.get("visita_id");
        const tipo_doc = formData.get("tipo_doc");

        if (!file || !visita_id || !tipo_doc) {
            return NextResponse.json(
                { error: "Faltan campos: documento, visita_id o tipo_doc" },
                { status: 400 }
            );
        }

        const result = await registerDocument({ visita_id, tipo_doc, file });

        return NextResponse.json(
            { success: true, data: result },
            { status: 201 }
        );

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}