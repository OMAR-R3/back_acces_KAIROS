export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { registerVisitante } from "@/services/authService";
import { checkRateLimit } from "@/middlewares/rateLimit";

export async function POST(req) {
    try {
        checkRateLimit(req, { keySuffix: "visitante-registro", max: 3 });

        const body = await req.json();

        if (
            !body?.nombre || !body?.apellido_paterno ||
            !body?.correo || !body?.telefono || !body?.password
        ) {
            return NextResponse.json(
                { success: false, error: "Todos los campos son requeridos" },
                { status: 400 }
            );
        }

        const visitante = await registerVisitante(body);
        const { password: _, ...visitanteSinPassword } = visitante;

        return NextResponse.json(
            { success: true, data: visitanteSinPassword },
            { status: 201 }
        );

    } catch (error) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: error.status || 500 }
        );
    }
}