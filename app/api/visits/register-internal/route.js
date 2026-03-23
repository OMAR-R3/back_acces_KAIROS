export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkAuth, checkRole } from "@/middlewares/auth";
import { getVisitanteByCorreo, createVisitante } from "@/services/visitorService";
import { createVisitInternal } from "@/services/visitService";
import { registerDocument } from "@/services/documentService";
import { supabase } from "@/db/supabaseClient";

/*
  POST /api/visits/register-internal
  Solo admin — requiere auth

  Recibe multipart/form-data con:
  - nombre, apellido_paterno, apellido_materno, correo, telefono  (visitante)
  - depto_id, fecha, hora_inicio, motivo                          (visita)
  - documento (archivo), tipo_doc                                 (documento)
  - usuario_id                                                    (quien registra)
*/
export async function POST(req) {
    let visita_id = null;
    let documentoGuardado = false;

    try {
        /*checkAuth(req);*/
        const payload = checkRole(req, ["administrador"]);

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
        const usuario_id = payload.id;

        // Validar campos requeridos
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

        // Buscar o crear visitante
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

        // Crear visita aprobada directamente + genera QR + manda correo
        const visita = await createVisitInternal(
            {
                visitante_id: visitante.id,
                depto_id: Number(depto_id),
                fecha,
                hora_inicio,
                motivo
            },
            payload.id);
        visita_id = visita.id;

        // Guardar documento
        await registerDocument({
            visita_id,
            tipo_doc,
            file: archivo
        });

        documentoGuardado = true;

        // Log de la acción
        await supabase.from("Logs_Acceso").insert([{
            usuario_id: Number(usuario_id),
            accion: `Registró visita interna ID ${visita_id} para ${visitante.nombre} ${visitante.apellido_paterno}`,
            fecha: new Date().toISOString()
        }]);

        return NextResponse.json(
            {
                success: true,
                message: "Visita registrada y aprobada correctamente",
                visita_id,
                visitante_id: visitante.id
            },
            { status: 201 }
        );

    } catch (error) {
        // Rollback si el documento falló después de crear la visita
        if (visita_id && !documentoGuardado) {
            await supabase.from("Visitas").delete().eq("id", visita_id);
        }

        console.error("Error en register-internal:", error.message);

        return NextResponse.json(
            { error: error.message },
            { status: error.status || 400 }
        );
    }
}
