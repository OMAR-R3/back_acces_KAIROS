import { supabase } from "../db/supabaseClient";
import { generateQR } from "../utils/qrGenerator";
import { sendVisitEmail } from "../services/emailService";

export const createVisit = async (visitData) => {
    const {
        visitante_id,
        depto_id,
        fecha,
        hora_inicio,
        motivo
    } = visitData;

    // 1️⃣ Validar visitante
    const { data: visitante, error: visitanteError } = await supabase
        .from("Visitantes")
        .select("id, nombre, correo")
        .eq("id", Number(visitante_id));

    if (visitanteError) throw new Error(visitanteError.message);
    if (!visitante || visitante.length === 0)
        throw new Error("El visitante no existe");

    const visitanteData = visitante[0];

    // 2️⃣ Validar departamento
    const { data: departamento, error: deptoError } = await supabase
        .from("Departamentos")
        .select("id")
        .eq("id", Number(depto_id));

    if (deptoError) throw new Error(deptoError.message);
    if (!departamento || departamento.length === 0)
        throw new Error("El departamento no existe");

    // 3️⃣ Verificar duplicado
    const { data: existingVisit, error: existingError } = await supabase
        .from("Visitas")
        .select("id")
        .eq("visitante_id", Number(visitante_id))
        .eq("depto_id", Number(depto_id))
        .eq("fecha", fecha)
        .eq("hora_inicio", hora_inicio);

    if (existingError) throw new Error(existingError.message);

    if (existingVisit && existingVisit.length > 0) {
        throw new Error("Ya existe una visita registrada con esos datos");
    }

    // 4️⃣ Insertar con QR temporal
    const { data: visit, error: insertError } = await supabase
        .from("Visitas")
        .insert([
            {
                visitante_id: Number(visitante_id),
                depto_id: Number(depto_id),
                fecha,
                hora_inicio,
                motivo,
                estado: "Pendiente",
                qr_code: "TEMP"
            }
        ])
        .select()
        .single();

    if (insertError) throw new Error(insertError.message);

    // 5️⃣ Generar QR
    const qrImage = await generateQR(visit.id);

    // 6️⃣ Actualizar QR
    const { error: updateError } = await supabase
        .from("Visitas")
        .update({ qr_code: qrImage })
        .eq("id", visit.id);

    if (updateError) throw new Error(updateError.message);

    // 7️⃣ Enviar correo
    try {
        await sendVisitEmail({
            email: visitanteData.correo,
            name: visitanteData.nombre,
            date: fecha,
            qrBase64: qrImage,
        });
    } catch (error) {
        console.error("Error enviando correo:", error.message);
    }

    return {
        ...visit,
        qr_code: qrImage
    };
};
/* =========================
   GET ALL
========================= */
export const getAllVisits = async () => {
    const { data, error } = await supabase
        .from("Visitas")
        .select(`
      *,
      Visitantes (*),
      Departamentos (*)
    `);

    if (error) throw new Error(error.message);

    return data;
};

/* =========================
   GET BY ID
========================= */
export const getVisitById = async (id) => {
    const { data, error } = await supabase
        .from("Visitas")
        .select(`
      *,
      Visitantes (*),
      Departamentos (*)
    `)
        .eq("id", id)
        .single();

    if (error) throw new Error("Visita no encontrada");

    return data;
};

/* =========================
   UPDATE
========================= */
export const updateVisit = async (id, updateData) => {

    // 1️⃣ Obtener visita actual
    const { data: currentVisit, error: fetchError } = await supabase
        .from("Visitas")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError) throw new Error("Visita no encontrada");

    // 2️⃣ Detectar cambios
    const changes = [];

    Object.keys(updateData).forEach((key) => {
        if (currentVisit[key] !== updateData[key]) {
            changes.push({
                field: key,
                oldValue: currentVisit[key],
                newValue: updateData[key],
            });
        }
    });

    // 3️⃣ Actualizar
    const { data, error } = await supabase
        .from("Visitas")
        .update(updateData)
        .eq("id", id)
        .select();

    if (error) throw new Error(error.message);

    if (!data || data.length === 0) {
        throw new Error("No se pudo actualizar");
    }

    return {
        updated: data[0],
        changes,
    };
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