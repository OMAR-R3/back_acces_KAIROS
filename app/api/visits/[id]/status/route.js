export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { updateVisitStatus } from "@/services/visitService";

export async function PATCH(req, { params }) {
    try {
        // 1️⃣ Auth y rol — cualquier interno puede cancelar/terminar
        const payload = checkRole(req, ["guardia", "recepcionista", "administrador"]);

        const { id } = await params;
        const { estado, motivo } = await req.json();

        // 2️⃣ Validar que llegó el estado
        if (!estado) {
            return NextResponse.json(
                { error: "El estado es requerido" },
                { status: 400 }
            );
        }

        // 3️⃣ Solo recepcionista y admin pueden aprobar
        if (estado === "aprobada" && !["recepcionista", "administrador"].includes(payload.rol)) {
            return NextResponse.json(
                { error: "Solo recepcionista o administrador pueden aprobar visitas" },
                { status: 403 }
            );
        }

        // 4️⃣ usuario_id viene del token, no del body
        const result = await updateVisitStatus(id, { estado, motivo }, payload.id);

        return NextResponse.json({ success: true, data: result });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status || 400 }
        );
    }
}