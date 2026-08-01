export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { deleteLog } from "@/services/logService";

/* DELETE — eliminar log por id en body */
export async function DELETE(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json(
                { error: "ID requerido" },
                { status: 400 }
            );
        }

        const deleted = await deleteLog(id);

        if (!deleted) {
            return NextResponse.json(
                { error: "Log no encontrado" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: deleted });
    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}