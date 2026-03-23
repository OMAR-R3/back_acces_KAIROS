import { supabase } from "../db/supabaseClient.js";
import { generateQR, generateQRToken } from "../utils/qrGenerator.js";
import { sendApprovalEmail, sendCancellationEmail } from "../services/emailService.js";
import { createLog } from "@/services/logService.js";
/* =========================
   GET ALL - con filtros opcionales
   ?estado=pendiente&fecha=2026-03-22
========================= */
export const getAllVisits = async (filters = {}) => {
    let query = supabase
        .from("Visitas")
        .select(`
            *,
            Visitantes (*),
            Departamentos (*)
        `)
        .order("created_at", { ascending: false });

    if (filters.estado) query = query.eq("estado", filters.estado);
    if (filters.fecha) query = query.eq("fecha", filters.fecha);
    if (filters.depto_id) query = query.eq("depto_id", filters.depto_id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
};

/* =========================
   GET BY ID - con documentos
========================= */
export const getVisitById = async (id) => {
    const { data, error } = await supabase
        .from("Visitas")
        .select(`
            *,
            Visitantes (*),
            Departamentos (*),
            Documentos (*)
        `)
        .eq("id", id)
        .single();

    if (error) throw new Error("Visita no encontrada");
    return data;
};

/* =========================
   GET BY CORREO - para extranet
========================= */
export const getVisitsByCorreo = async (correo) => {
    // Primero buscar el visitante
    const { data: visitante, error: visitanteError } = await supabase
        .from("Visitantes")
        .select("id")
        .eq("correo", correo)
        .maybeSingle();

    if (visitanteError) throw new Error(visitanteError.message);
    if (!visitante) return []; // No existe visitante con ese correo

    // Luego sus visitas
    const { data, error } = await supabase
        .from("Visitas")
        .select(`
            id,
            fecha,
            hora_inicio,
            motivo,
            estado,
            created_at,
            Departamentos (nombre, ubicacion)
        `)
        .eq("visitante_id", visitante.id)
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

/* =========================
   CREATE - solo registro, sin QR ni correo
   Usado desde el formulario público
========================= */
export const createVisit = async (visitData) => {
    const { visitante_id, depto_id, fecha, hora_inicio, motivo } = visitData;

    // Validar que no exista visita duplicada
    const { data: existing, error: existingError } = await supabase
        .from("Visitas")
        .select("id")
        .eq("visitante_id", Number(visitante_id))
        .eq("depto_id", Number(depto_id))
        .eq("fecha", fecha)
        .eq("hora_inicio", hora_inicio)
        .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) throw new Error("Ya existe una visita registrada con esos datos");

    // Insertar visita en estado pendiente, sin QR aún
    const { data: visit, error: insertError } = await supabase
        .from("Visitas")
        .insert([{
            visitante_id: Number(visitante_id),
            depto_id: Number(depto_id),
            fecha,
            hora_inicio,
            motivo,
            estado: "pendiente",
            qr_code: null // Se genera solo al aprobar
        }])
        .select()
        .single();

    if (insertError) throw new Error(insertError.message);
    return visit;
};

/* =========================
   CREATE INTERNAL - admin registra sin aprobación
========================= */
export const createVisitInternal = async (visitData, usuario_id) => {
    const { visitante_id, depto_id, fecha, hora_inicio, motivo } = visitData;

    // Verificar duplicado
    const { data: existing } = await supabase
        .from("Visitas")
        .select("id")
        .eq("visitante_id", Number(visitante_id))
        .eq("depto_id", Number(depto_id))
        .eq("fecha", fecha)
        .eq("hora_inicio", hora_inicio)
        .maybeSingle();

    if (existing) throw new Error("Ya existe una visita registrada con esos datos");

    // Generar QR inmediatamente
    const token = generateQRToken();
    const qrImage = await generateQR(token);

    // Buscar datos del visitante para el correo
    const { data: visitante } = await supabase
        .from("Visitantes")
        .select("nombre, correo")
        .eq("id", Number(visitante_id))
        .single();

    // Insertar visita ya aprobada
    const { data: visit, error: insertError } = await supabase
        .from("Visitas")
        .insert([{
            visitante_id: Number(visitante_id),
            depto_id: Number(depto_id),
            fecha,
            hora_inicio,
            motivo,
            estado: "aprobada",
            qr_code: token
        }])
        .select()
        .single();

    if (insertError) throw new Error(insertError.message);

    // Registrar en historial
    await supabase.from("Historial_Estados").insert([{
        visita_id: visit.id,
        usuario_id,
        estado_nuevo: "aprobada",
        fecha: new Date().toISOString()
    }]);

    // Enviar correo con QR
    try {
        await sendApprovalEmail({
            email: visitante.correo,
            name: visitante.nombre,
            date: fecha,
            time: hora_inicio,
            qrBase64: qrImage,
        });
    } catch (err) {
        console.error("Error enviando correo:", err.message);
    }

    return { ...visit, qr_code: token };
};

/* =========================
   UPDATE STATUS - aprobar / cancelar / finalizar
========================= */
export const updateVisitStatus = async (id, { estado, motivo }, usuario_id) => {
    const estadosValidos = ["aprobada", "cancelada", "finalizada"];
    if (!estadosValidos.includes(estado)) {
        throw new Error("Estado no válido");
    }

    if (estado === "cancelada" && (!motivo || motivo.trim() === "")) {
        throw new Error("El motivo es requerido para cancelar una visita");
    }

    // Obtener visita + visitante
    const { data: visit, error: fetchError } = await supabase
        .from("Visitas")
        .select(`*, Visitantes (nombre, correo)`)
        .eq("id", id)
        .single();

    if (fetchError || !visit) throw new Error("Visita no encontrada");

    let qrToken = visit.qr_code;
    let qrImage = null;

    // Si se aprueba, generar QR
    if (estado === "aprobada") {
        qrToken = generateQRToken();
        qrImage = await generateQR(qrToken);
    }

    // Actualizar estado en Visitas
    const { error: updateError } = await supabase
        .from("Visitas")
        .update({
            estado,
            qr_code: estado === "aprobada" ? qrToken : visit.qr_code
        })
        .eq("id", id);

    if (updateError) throw new Error(updateError.message);

    // Registrar en historial
    await supabase.from("Historial_Estados").insert([{
        visita_id: id,
        usuario_id,
        estado_nuevo: estado,
        motivo: motivo || null,
        fecha: new Date().toISOString()
    }]);

    // Enviar correo — independiente del log
    try {
        if (estado === "aprobada") {
            await sendApprovalEmail({
                email: visit.Visitantes.correo,
                name: visit.Visitantes.nombre,
                date: visit.fecha,
                qrBase64: qrImage,
            });
        } else if (estado === "cancelada") {
            await sendCancellationEmail({
                email: visit.Visitantes.correo,
                name: visit.Visitantes.nombre,
                date: visit.fecha,
                motivo,
            });
        }
    } catch (err) {
        console.error("Error enviando correo:", err.message);
    }

    // Registrar log — separado del correo
    try {
        const accionLog = {
            aprobada: `Aprobó visita ID ${id} — ${visit.Visitantes?.nombre}`,
            cancelada: `Canceló visita ID ${id} — ${visit.Visitantes?.nombre} — Motivo: ${motivo}`,
            finalizada: `Finalizó visita ID ${id} — ${visit.Visitantes?.nombre}`
        };
        await createLog(Number(usuario_id), accionLog[estado]);
    } catch (err) {
        console.error("Error registrando log:", err.message);
    }

    return { id, estado, motivo: motivo || null };
};

/* =========================
   VALIDATE QR - para guardia en entrada
========================= */
export const validateQR = async (token) => {
    const { data, error } = await supabase
        .from("Visitas")
        .select(`
            *,
            Visitantes (nombre, correo),
            Departamentos (nombre)
        `)
        .eq("qr_code", token)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("QR no válido");
    if (data.estado !== "aprobada") {
        throw new Error(`Visita no está aprobada (estado actual: ${data.estado})`);
    }

    return data;
};

/* =========================
   DELETE
========================= */
export const deleteVisit = async (id) => {
    const { error } = await supabase
        .from("Visitas")
        .delete()
        .eq("id", id);

    if (error) throw new Error(error.message);
    return { message: "Visita eliminada correctamente" };
};