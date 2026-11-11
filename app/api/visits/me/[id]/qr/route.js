import { NextResponse } from "next/server";
import { checkRole } from "@/middlewares/auth";
import { verificarSesionVisitante } from "@/middlewares/sesionVisitante";
import { checkRateLimit } from "@/middlewares/rateLimit";
import { getVisitQRByIdAndVisitanteId } from "@/services/visitService";
import { calcularVentanaQR } from "@/utils/qrVigencia";

const bad = (message, status) =>
    NextResponse.json({ success: false, error: message }, { status });

export async function GET(req, { params }) {
    try {
        const payload = checkRole(req, ["visitante"]);
        await verificarSesionVisitante(payload);
        checkRateLimit(req, { keySuffix: "visitas-qr", max: 30 });

        const { id } = await params;
        if (!/^\d+$/.test(id)) return bad("Visita no encontrada", 404);

        const v = await getVisitQRByIdAndVisitanteId(id, payload.id);
        if (!v) return bad("Visita no encontrada", 404);
        if (v.estado !== "aprobada" || !v.qr_code) {
            return bad("La visita aún no tiene código QR", 409);
        }

        const ventana = calcularVentanaQR(v.fecha, v.hora_inicio);
        if (!ventana) throw new Error("Fecha de la visita inválida");

        const accesos = v.Accesos_QR;
        const usado = Array.isArray(accesos) ? accesos.length > 0 : Boolean(accesos);

        let estado_qr = "valido";
        if (usado) estado_qr = "usado";
        else if (new Date() > ventana.hasta) estado_qr = "expirado";

        return NextResponse.json(
            {
                success: true,
                data: {
                    visita_id: v.id,
                    folio: "KV-" + String(v.id).padStart(6, "0"),
                    // El token solo se entrega mientras el QR sirve.
                    qr: estado_qr === "valido" ? v.qr_code : null,
                    estado_qr,
                    vigente_desde: ventana.desde.toISOString(),
                    vigente_hasta: ventana.hasta.toISOString(),
                },
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        if (error?.status && error.status < 500) return bad(error.message, error.status);
        console.error("GET /api/visits/me/[id]/qr:", error);
        return bad("No se pudo obtener el código QR", 500);
    }
}