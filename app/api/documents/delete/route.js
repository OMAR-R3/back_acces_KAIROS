export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { deleteDocument } from "@/services/documentService";

export async function DELETE(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const body = await req.json();
        const { visita_id } = body;

        if (!visita_id) {
            return NextResponse.json(
                { error: "visita_id requerido" },
                { status: 400 }
            );
        }

        const result = await deleteDocument(visita_id);

        if (!result) {
            return NextResponse.json(
                { error: "Documento no encontrado" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}