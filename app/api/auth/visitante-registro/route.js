export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { registerVisitante } from "@/services/authService";

export async function POST(req) {
    try {
        const body = await req.json();

        if (
            !body?.nombre || !body?.apellido_paterno || !body?.apellido_materno ||
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