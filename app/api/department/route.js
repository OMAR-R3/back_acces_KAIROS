export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
    getDepartamentos,
    createDepartamento,
    updateDepartamento,
    deleteDepartamento
} from "../../../services/departmentService.js";
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

        const data = await getDepartamentos();

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

        if (!body?.nombre) {
            throw new Error("Nombre requerido");
        }

        const departamento = await createDepartamento(body);

        return NextResponse.json(
            { success: true, data: departamento },
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

        const departamento = await updateDepartamento(body.id, body);

        return NextResponse.json(
            { success: true, data: departamento },
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

        const departamento = await deleteDepartamento(body.id);

        return NextResponse.json(
            { success: true, data: departamento },
            { status: 200 }
        );
    } catch (err) {
        return handleError(err);
    }
}
