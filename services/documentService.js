import path from "path";
import fs from "fs";
import { supabase } from "@/db/supabaseClient";
import { saveFile, deleteFile } from "@/utils/fileStorage";


export async function registerDocument({ visita_id, tipo_doc, file }) {
    let savedFileName = null;

    try {
        // 🔎 Verificar si ya existe documento para esa visita
        const { data: existing } = await supabase
            .from("Documentos")
            .select("id")
            .eq("visita_id", visita_id)
            .maybeSingle();

        if (existing) {
            throw new Error("Esta visita ya tiene un documento registrado");
        }

        // 🔒 Validaciones
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!allowedTypes.includes(file.type)) {
            throw new Error("Tipo de archivo no permitido");
        }

        if (file.size > maxSize) {
            throw new Error("Archivo demasiado grande (máx 5MB)");
        }

        // 🧠 Convertir a buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // 💾 Guardar en disco
        savedFileName = saveFile(buffer, file.name);

        // 🗄 Guardar metadata en DB
        const { error } = await supabase
            .from("Documentos")
            .insert([
                {
                    visita_id,
                    tipo_doc,
                    file_name: savedFileName,
                    file_size: file.size,
                    mime_type: file.type,
                },
            ]);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        // 🔁 Rollback si falla DB
        if (savedFileName) {
            deleteFile(savedFileName);
        }

        throw error;
    }
}

const uploadPath = path.join(process.cwd(), "storage", "documents");

export async function downloadDocument(visita_id) {
    // Buscar metadata
    const { data, error } = await supabase
        .from("Documentos")
        .select("file_name, mime_type")
        .eq("visita_id", visita_id)
        .single();

    if (error || !data) {
        throw new Error("Documento no encontrado");
    }

    const filePath = path.join(uploadPath, data.file_name);

    if (!fs.existsSync(filePath)) {
        throw new Error("Archivo no existe en servidor");
    }

    const buffer = fs.readFileSync(filePath);

    return {
        buffer,
        file_name: data.file_name,
        mime_type: data.mime_type,
    };
}

export async function deleteDocument(visita_id) {

    // 1️⃣ Buscar metadata del documento
    const { data, error } = await supabase
        .from("Documentos")
        .select("file_name")
        .eq("visita_id", visita_id)
        .single();

    if (error || !data) {
        return null; // El route decide si es 404
    }

    // 2️⃣ Eliminar archivo físico usando tu utilidad
    deleteFile(data.file_name);

    // 3️⃣ Eliminar registro en base de datos
    const { error: deleteError } = await supabase
        .from("Documentos")
        .delete()
        .eq("visita_id", visita_id);

    if (deleteError) {
        throw deleteError;
    }

    return { success: true };
}