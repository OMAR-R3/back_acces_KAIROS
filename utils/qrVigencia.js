export const VENTANA_MINUTOS = 30;
const OFFSET_MEXICO = "-06:00";

export const calcularVentanaQR = (fecha, horaInicio) => {
    if (!fecha || !horaInicio) return null;
    const dia = String(fecha).slice(0, 10);
    const hora = String(horaInicio).slice(0, 5) + ":00";
    const inicio = new Date(`${dia}T${hora}${OFFSET_MEXICO}`);
    if (Number.isNaN(inicio.getTime())) return null;
    const ms = VENTANA_MINUTOS * 60 * 1000;
    return {
        desde: new Date(inicio.getTime() - ms),
        hasta: new Date(inicio.getTime() + ms),
    };
};

// "antes" | "vigente" | "expirado"
export const estadoVentana = (ventana, ahora = new Date()) => {
    if (ahora < ventana.desde) return "antes";
    if (ahora > ventana.hasta) return "expirado";
    return "vigente";
};