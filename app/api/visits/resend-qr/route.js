export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/db/supabaseClient";
import { generateQR } from "@/utils/qrGenerator";
import { resendQREmail } from "@/services/emailService";

/*
  POST /api/visits/resend-qr
  Ruta pública — no requiere auth
  Usada desde el extranet cuando el visitante quiere que le reenvíen su QR

  Body: { visita_id: number, correo: string }
*/
export async function POST(req) {
    try {
        const { visita_id, correo } = await req.json();

        if (!visita_id || !correo) {
            return NextResponse.json(
                { error: "visita_id y correo son requeridos" },
                { status: 400 }
            );
        }

        // Buscar la visita con datos del visitante
        const { data: visita, error } = await supabase
            .from("Visitas")
            .select(`
                *,
                Visitantes (nombre, correo)
            `)
            .eq("id", visita_id)
            .single();

        if (error || !visita) {
            return NextResponse.json(
                { error: "Visita no encontrada" },
                { status: 404 }
            );
        }

        // Verificar que el correo coincide con el visitante
        // Evita que alguien pida el QR de una visita ajena
        if (visita.Visitantes.correo.toLowerCase() !== correo.toLowerCase()) {
            return NextResponse.json(
                { error: "El correo no corresponde a esta visita" },
                { status: 403 }
            );
        }

        // Solo se puede reenviar si la visita está aprobada
        if (visita.estado !== "aprobada") {
            return NextResponse.json(
                {
                    error: `No se puede reenviar el QR, la visita está: ${visita.estado}`
                },
                { status: 400 }
            );
        }

        // Verificar que tiene QR generado
        if (!visita.qr_code) {
            return NextResponse.json(
                { error: "Esta visita no tiene QR generado aún" },
                { status: 400 }
            );
        }

        // Regenerar imagen QR a partir del token guardado
        const qrImage = await generateQR(visita.qr_code);

        // Reenviar correo
        await resendQREmail({
            email: visita.Visitantes.correo,
            name: visita.Visitantes.nombre,
            date: visita.fecha,
            time: visita.hora_inicio,
            qrBase64: qrImage
        });

        return NextResponse.json({
            success: true,
            message: "QR reenviado correctamente al correo registrado"
        });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}