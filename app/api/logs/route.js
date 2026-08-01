export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { createLog, getLogs } from "@/services/logService";

/* GET — lista de logs, filtrable por usuario_id */
export async function GET(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const { searchParams } = new URL(req.url);
        const usuario_id = searchParams.get("usuario_id") || null;

        const logs = await getLogs(usuario_id);
        return NextResponse.json({ success: true, data: logs });
    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}

/* POST — registrar log manualmente si se necesita */
export async function POST(req) {
    try {
        checkAuth(req);

        const { usuario_id, accion } = await req.json();

        if (!usuario_id || !accion) {
            return NextResponse.json(
                { error: "usuario_id y accion son requeridos" },
                { status: 400 }
            );
        }

        const log = await createLog(usuario_id, accion);
        return NextResponse.json({ success: true, data: log }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 500 }
        );
    }
}