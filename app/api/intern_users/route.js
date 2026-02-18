import { NextResponse } from "next/server";
import {
    getUsuarios,
    createUsuario,
    updateUsuario,
    deleteUsuario
} from "../../../services/userService.js";
import { checkAuth } from "../../../middlewares/auth.js";

/* =========================
   Helper de manejo de error
========================= */
function handleError(err) {
    console.error("API ERROR:", err);

    const message = err.message || "Internal server error";

    // Errores de autenticación
    if (message.includes("API") || message.includes("auth")) {
        return NextResponse.json(
            { success: false, error: message },
            { status: 401 }
        );
    }

    // Errores de validación
    if (message.includes("required") || message.includes("invalid")) {
        return NextResponse.json(
            { success: false, error: message },
            { status: 400 }
        );
    }

    // Error general
    return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
    );
}

/* =========================
   GET - Obtener usuarios
========================= */
/*export async function GET(req) {
    try {
        checkAuth(req);

        const data = await getUsuarios();

        return NextResponse.json(
            { success: true, data },
            { status: 200 }
        );

    } catch (err) {
        return handleError(err);
    }
}*/

/*export async function GET(req) {
    try {
        checkAuth(req);

        const { searchParams } = new URL(req.url);

        // Creamos el objeto de filtros desde la URL
        const filters = {
            q: searchParams.get("q"),
            role: searchParams.get("role"),
            status: searchParams.get("status"),
            page: searchParams.get("page") || 1,
            limit: searchParams.get("limit") || 10
        };

        const data = await getUsuarios(filters);

        return NextResponse.json(
            { success: true, ...data },
            { status: 200 }
        );
    } catch (err) {
        return handleError(err);
    }
}*/
5
const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Permite que tu Visual Studio se conecte
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req) {
    try {
        checkAuth(req);

        const { searchParams } = new URL(req.url);

        // 1. Recibimos 'rol' directamente del Frontend (script.js ya lo envía bien)
        const filters = {
            q: searchParams.get("q") || "",
            rol: searchParams.get("rol") || "", // <--- Todo en español
            page: parseInt(searchParams.get("page")) || 1,
            limit: parseInt(searchParams.get("limit")) || 10
        };

        console.log("DEBUG BACKEND - Filtros hacia el servicio:", filters);

        const data = await getUsuarios(filters);

        return NextResponse.json(
            { success: true, ...data },
            { status: 200, headers: corsHeaders }
        );

    } catch (err) {
        console.error("API ERROR:", err.message);
        return NextResponse.json(
            { success: false, error: err.message },
            { status: 500, headers: corsHeaders }
        );
    }
}

/* =========================
   POST - Crear usuario
========================= */
export async function POST(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body) {
            throw new Error("Request body required");
        }

        const usuario = await createUsuario(body);

        return NextResponse.json(
            { success: true, data: usuario },
            { status: 201 }
        );

    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   PUT - Actualizar usuario
========================= */
export async function PUT(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.id) {
            throw new Error("User ID required");
        }

        const usuario = await updateUsuario(body.id, body);

        return NextResponse.json(
            { success: true, data: usuario },
            { status: 200 }
        );

    } catch (err) {
        return handleError(err);
    }
}

/* =========================
   DELETE - Eliminar usuario
========================= */
export async function DELETE(req) {
    try {
        checkAuth(req);

        const body = await req.json();

        if (!body?.id) {
            throw new Error("User ID required");
        }

        const usuario = await deleteUsuario(body.id);

        return NextResponse.json(
            { success: true, data: usuario },
            { status: 200 }
        );

    } catch (err) {
        return handleError(err);
    }
}
