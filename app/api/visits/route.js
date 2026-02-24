import { NextResponse } from "next/server";
import {
    createVisit,
    getAllVisits,
    getVisitById,
    updateVisit,
    deleteVisit
} from "@/services/visitService";
import QRCode from "qrcode";
import { sendVisitUpdateEmail } from "@/services/emailService";
import { supabase } from "@/db/supabaseClient";

/* =========================
   GET
========================= */
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (id) {
            const visit = await getVisitById(id);
            return NextResponse.json(visit);
        }

        const visits = await getAllVisits();
        return NextResponse.json(visits);

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}

/* =========================
   POST
========================= */
export async function POST(req) {
    try {
        const body = await req.json();
        const newVisit = await createVisit(body);

        return NextResponse.json(newVisit, { status: 201 });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}

/* =========================
   PUT
========================= */
export async function PUT(req) {
    try {
        const body = await req.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json(
                { error: "ID es requerido" },
                { status: 400 }
            );
        }

        const result = await updateVisit(id, updateData);

        const visit = result.updated;
        const changes = result.changes;

        // 🔹 Obtener datos del visitante
        const { data: visitante } = await supabase
            .from("Visitantes")
            .select("nombre, correo")
            .eq("id", visit.visitante_id)
            .single();

        if (!visitante) {
            throw new Error("No se pudo obtener el visitante");
        }

        // 🔹 Generar nuevo QR
        const qrData = JSON.stringify({
            id: visit.id,
            nombre: visit.nombre,
            fecha: visit.fecha,
        });

        const qrBase64 = await QRCode.toDataURL(qrData);

        // 🔹 Enviar correo notificando cambios
        await sendVisitUpdateEmail({
            email: visitante.correo,
            name: visitante.nombre,
            date: visit.fecha,
            changes,
            qrBase64,
        });

        return NextResponse.json({
            message: "Visita actualizada correctamente",
            visit,
            changes,
        });

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}
/* =========================
   DELETE
========================= */
export async function DELETE(req) {
    try {
        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json(
                { error: "ID es requerido" },
                { status: 400 }
            );
        }

        const result = await deleteVisit(id);

        return NextResponse.json(result);

    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}