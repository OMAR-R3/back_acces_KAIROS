export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getVisitanteByCorreo, createVisitante } from "@/services/visitorService";
import { createVisit } from "@/services/visitService";
import { registerDocument } from "@/services/documentService";
import { supabase } from "@/db/supabaseClient";

export async function POST(req) {
    let visita_id = null;
    let documentoGuardado = false;

    try {
        const contentType = req.headers.get("content-type") || "";

        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json(
                { error: "Se requiere multipart/form-data" },
                { status: 400 }
            );
        }

        const formData = await req.formData();

        const nombre = formData.get("nombre")?.trim();
        const apellido_paterno = formData.get("apellido_paterno")?.trim();
        const apellido_materno = formData.get("apellido_materno")?.trim();
        const correo = formData.get("correo")?.trim().toLowerCase();
        const telefono = formData.get("telefono")?.trim();
        const depto_id = formData.get("depto_id");
        const fecha = formData.get("fecha");
        const hora_inicio = formData.get("hora_inicio");
        const motivo = formData.get("motivo")?.trim();
        const tipo_doc = formData.get("tipo_doc")?.trim();
        const archivo = formData.get("documento");

        const faltantes = [];
        if (!nombre) faltantes.push("nombre");
        if (!apellido_paterno) faltantes.push("apellido_paterno");
        if (!correo) faltantes.push("correo");
        if (!telefono) faltantes.push("telefono");
        if (!depto_id) faltantes.push("depto_id");
        if (!fecha) faltantes.push("fecha");
        if (!hora_inicio) faltantes.push("hora_inicio");
        if (!motivo) faltantes.push("motivo");
        if (!tipo_doc) faltantes.push("tipo_doc");
        if (!archivo) faltantes.push("documento");

        if (faltantes.length > 0) {
            return NextResponse.json(
                { error: `Campos requeridos faltantes: ${faltantes.join(", ")}` },
                { status: 400 }
            );
        }

        let visitante = await getVisitanteByCorreo(correo);
        if (!visitante) {
            visitante = await createVisitante({
                nombre,
                apellido_paterno,
                apellido_materno: apellido_materno || null,
                correo,
                telefono
            });
        }

        const visita = await createVisit({
            visitante_id: visitante.id,
            depto_id: Number(depto_id),
            fecha,
            hora_inicio,
            motivo
        });

        visita_id = visita.id;

        await registerDocument({ visita_id, tipo_doc, file: archivo });
        documentoGuardado = true;

        await supabase.from("Historial_Estados").insert([{
            visita_id,
            usuario_id: null,
            estado_nuevo: "pendiente",
            motivo: null,
            fecha: new Date().toISOString()
        }]);

        return NextResponse.json(
            {
                success: true,
                message: "Visita registrada correctamente, pendiente de aprobación",
                visita_id,
                visitante_id: visitante.id
            },
            { status: 201 }
        );

    } catch (error) {
        if (visita_id && !documentoGuardado) {
            await supabase.from("Visitas").delete().eq("id", visita_id);
        }
        console.error("Error en register:", error.message);
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}