export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
    getUsuarios,
    createUsuario,
    updateUsuario,
    deleteUsuario
} from "@/services/userService";
import { checkAuth, checkRole } from "@/middlewares/auth";

function handleError(err) {
    console.error("API ERROR:", err);
    return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status || 500 }
    );
}

/* GET — lista con filtros opcionales ?q=&rol=&page=&limit= */
export async function GET(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const { searchParams } = new URL(req.url);
        const filters = {
            q: searchParams.get("q") || "",
            rol: searchParams.get("rol") || "",
            page: parseInt(searchParams.get("page")) || 1,
            limit: parseInt(searchParams.get("limit")) || 10
        };

        const data = await getUsuarios(filters);
        return NextResponse.json({ success: true, ...data }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}

/* POST — crear usuario interno */
export async function POST(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

        const body = await req.json();
        if (!body?.nombre || !body?.rol) {
            return NextResponse.json(
                { success: false, error: "Nombre y rol son requeridos" },
                { status: 400 }
            );
        }

        const usuario = await createUsuario(body);
        return NextResponse.json({ success: true, data: usuario }, { status: 201 });
    } catch (err) {
        return handleError(err);
    }
}

/* PUT — actualizar usuario interno */
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

        const usuario = await updateUsuario(body.id, body);
        return NextResponse.json({ success: true, data: usuario }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}

/* DELETE — eliminar usuario interno */
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

        const usuario = await deleteUsuario(body.id);
        return NextResponse.json({ success: true, data: usuario }, { status: 200 });
    } catch (err) {
        return handleError(err);
    }
}