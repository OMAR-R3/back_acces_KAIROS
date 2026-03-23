export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
    getDepartamentos,
    createDepartamento,
    updateDepartamento,
    deleteDepartamento
} from "@/services/departmentService";
import { checkAuth, checkRole } from "@/middlewares/auth";

function handleError(err) {
    console.error("API ERROR:", err);
    return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status || 500 }
    );
}

/* GET — público, el extranet lo necesita para el formulario */
export async function GET() {
    try {
        const data = await getDepartamentos();
        return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}

/* POST — solo admin */
export async function POST(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const body = await req.json();
        if (!body?.nombre) {
            return NextResponse.json(
                { success: false, error: "Nombre requerido" },
                { status: 400 }
            );
        }

        const departamento = await createDepartamento(body);
        return NextResponse.json({ success: true, data: departamento }, { status: 201 });
    } catch (err) {
        return handleError(err);
    }
}

/* PUT — solo admin */
export async function PUT(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const body = await req.json();
        if (!body?.id) {
            return NextResponse.json(
                { success: false, error: "ID requerido" },
                { status: 400 }
            );
        }

        const departamento = await updateDepartamento(body.id, body);
        return NextResponse.json({ success: true, data: departamento }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}

/* DELETE — solo admin */
export async function DELETE(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const body = await req.json();
        if (!body?.id) {
            return NextResponse.json(
                { success: false, error: "ID requerido" },
                { status: 400 }
            );
        }

        const departamento = await deleteDepartamento(body.id);
        return NextResponse.json({ success: true, data: departamento }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}