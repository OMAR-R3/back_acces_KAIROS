import { NextResponse } from "next/server";
import { supabase } from "@/db/supabaseClient";

export async function POST(req) {
    try {
        const { qrData } = await req.json();

        if (!qrData) {
            return NextResponse.json(
                { error: "QR inválido" },
                { status: 400 }
            );
        }

        // qrData ejemplo:
        // VISIT:15:mi_super_secreto_2026

        const parts = qrData.split(":");

        if (parts.length !== 3 || parts[0] !== "VISIT") {
            return NextResponse.json(
                { error: "Formato de QR inválido" },
                { status: 400 }
            );
        }

        const visitId = parts[1];
        const secret = parts[2];

        // Validar secreto
        if (secret !== process.env.QR_SECRET) {
            return NextResponse.json(
                { error: "QR no autorizado" },
                { status: 403 }
            );
        }

        // Buscar visita
        const { data: visit, error } = await supabase
            .from("Visitas")
            .select(`
        *,
        Visitantes (*),
        Departamentos (*)
      `)
            .eq("id", visitId)
            .single();

        if (error || !visit) {
            return NextResponse.json(
                { error: "Visita no encontrada" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            valid: true,
            visit
        });

    } catch (error) {
        return NextResponse.json(
            { error: "Error validando QR" },
            { status: 500 }
        );
    }
}