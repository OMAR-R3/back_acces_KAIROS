export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { downloadDocument } from "@/services/documentService";

// Solo accesible desde el dashboard admin (intranet)
export async function GET(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["recepcionista", "administrador"]);

        const { searchParams } = new URL(req.url);
        const visita_id = searchParams.get("visita_id");

        if (!visita_id) {
            return NextResponse.json(
                { error: "visita_id requerido" },
                { status: 400 }
            );
        }

        const fileData = await downloadDocument(visita_id);

        return new NextResponse(fileData.buffer, {
            headers: {
                "Content-Type": fileData.mime_type,
                "Content-Disposition": `inline; filename="${fileData.file_name}"`,
            },
        });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}