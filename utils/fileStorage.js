import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const basePath = path.join(process.cwd(), "storage", "documents");

export function ensureStorageDir() {
    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
    }
}

export function saveFile(buffer, originalName) {
    ensureStorageDir();

    // Obtener extensión
    const ext = path.extname(originalName);

    // Generar UUID + extensión
    const uniqueName = `${uuidv4()}${ext}`;

    const filePath = path.join(basePath, uniqueName);

    fs.writeFileSync(filePath, buffer);

    return uniqueName;
}

export function deleteFile(fileName) {
    const filePath = path.join(basePath, fileName);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}