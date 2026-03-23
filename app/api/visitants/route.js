export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
    getVisitantes,
    createVisitante,
    updateVisitante,
    deleteVisitante
} from "@/services/visitorService";
import { checkAuth } from "@/middlewares/auth";

/* =========================
   Helper de errores
========================= */
function handleError(err) {
    console.error("API ERROR:", err);
    return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status || 500 }  // respeta 401, 404, etc.
    );
}

/* =========================
   GET — lista de visitantes (solo admin)
========================= */
export async function GET(req) {
    try {
        checkAuth(req);
        const data = await getVisitantes();
        return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   POST — crear visitante manualmente (solo admin)
========================= */
export async function POST(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.nombre || !body?.correo) {
            return NextResponse.json(
                { success: false, error: "Nombre y correo son requeridos" },
                { status: 400 }
            );
        }

        const visitante = await createVisitante(body);
        return NextResponse.json({ success: true, data: visitante }, { status: 201 });
    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   PUT — actualizar visitante (solo admin)
========================= */
export async function PUT(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.id) {
            return NextResponse.json(
                { success: false, error: "ID requerido" },
                { status: 400 }
            );
        }

        const visitante = await updateVisitante(body.id, body);
        return NextResponse.json({ success: true, data: visitante }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   DELETE — eliminar visitante (solo admin)
========================= */
export async function DELETE(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.id) {
            return NextResponse.json(
                { success: false, error: "ID requerido" },
                { status: 400 }
            );
        }

        const visitante = await deleteVisitante(body.id);
        return NextResponse.json({ success: true, data: visitante }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}