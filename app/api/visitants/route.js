export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
    getVisitantes,
    createVisitante,
    updateVisitante,
    deleteVisitante
} from "../../../services/visitorService.js";
import { checkAuth } from "../../../middlewares/auth.js";

/* =========================
   Helper de errores
========================= */
function handleError(err) {
    console.error("API ERROR:", err);
    return NextResponse.json(
        { success: false, error: err.message },
        { status: 500 }
    );
}

/* =========================
   GET
========================= */
export async function GET(req) {
    try {
        checkAuth(req);

        const data = await getVisitantes();

        return NextResponse.json(
            { success: true, data },
            { status: 200 }
        );
    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   POST
========================= */
export async function POST(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.nombre || !body?.correo) {
            throw new Error("Nombre y correo son requeridos");
        }

        const visitante = await createVisitante(body);

        return NextResponse.json(
            { success: true, data: visitante },
            { status: 201 }
        );
    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   PUT
========================= */
export async function PUT(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.id) {
            throw new Error("ID requerido");
        }

        const visitante = await updateVisitante(body.id, body);

        return NextResponse.json(
            { success: true, data: visitante },
            { status: 200 }
        );
    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   DELETE
========================= */
export async function DELETE(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.id) {
            throw new Error("ID requerido");
        }

        const visitante = await deleteVisitante(body.id);

        return NextResponse.json(
            { success: true, data: visitante },
            { status: 200 }
        );
    } catch (err) {
        return handleError(err);
    }
}
