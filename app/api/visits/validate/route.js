export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { validateQR } from "@/services/visitService";
import { createLog } from "@/services/logService";

/*
  POST /api/visits/validate
  Usado por el guardia en entrada

  Body: { token: "uuid-del-qr", usuario_id: number }
*/
export async function POST(req) {
    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["guardia", "recepcionista", "administrador"]);

        const { token, usuario_id } = await req.json();

        if (!token) {
            return NextResponse.json(
                { error: "Token QR requerido" },
                { status: 400 }
            );
        }

        const visita = await validateQR(token);

        // Registrar en logs que el guardia validó el acceso
        if (usuario_id) {
            await createLog(
                payload.id,
                `Validó acceso QR de visita ID ${visita.id} — ${visita.Visitantes?.nombre}`
            ).catch(err => console.error("Error registrando log:", err.message));
        }

        return NextResponse.json({
            success: true,
            valid: true,
            data: visita
        });

    } catch (error) {
        // validateQR lanza error con mensaje específico si el QR no es válido
        const isClientError = [
            "QR no válido",
            "Visita no está aprobada"
        ].some(msg => error.message.includes(msg));

        return NextResponse.json(
            { success: false, valid: false, error: error.message },
            { status: isClientError ? 400 : 500 }
        );
    }
}