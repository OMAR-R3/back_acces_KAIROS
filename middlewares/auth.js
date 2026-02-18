export function checkAuth(req) {
    // El nombre del header debe ser exacto al que mandas en el JS
    const recibido = req.headers.get("x-api-key");
    const esperado = process.env.API_KEY;

    console.log("CHECKAUTH - RECIBIDO:", recibido);
    console.log("CHECKAUTH - ESPERADO:", esperado);

    if (!recibido || recibido !== esperado) {
        const error = new Error("AUTH_FAIL");
        error.status = 401; // Importante para el catch
        throw error;
    }
}