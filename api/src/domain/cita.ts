// Reglas de negocio de las citas de la Veterinaria Patitas.
// Todo lo que tiene que ver con fechas se evalúa en hora de Bogotá.

export const ESPECIES = ["perro", "gato", "ave", "otro"] as const;
export type Especie = (typeof ESPECIES)[number];

export const ZONA_HORARIA = "America/Bogota";
export const DIAS_MAXIMOS_ANTICIPACION = 60;
export const VERSION_POLITICA_DATOS = "2026-11";

export interface NuevaCita {
  duenoNombre: string;
  duenoEmail: string;
  duenoTelefono: string;
  mascotaNombre: string;
  especie: Especie;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  motivo: string;
}

export interface Cita extends NuevaCita {
  id: string;
  estado: "agendada";
  creadaEn: string;
  consentimiento: {
    aceptado: true;
    fecha: string;
    versionPolitica: string;
  };
}

/** Lo que se muestra en el listado: sin correo ni teléfono (Ley 1581). */
export interface CitaPublica {
  id: string;
  fecha: string;
  hora: string;
  mascotaNombre: string;
  especie: Especie;
  motivo: string;
  duenoIniciales: string;
  estado: "agendada";
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: string[] };

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA = /^([01]\d|2[0-3]):(00|30)$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Franjas de 30 minutos. Lunes a viernes 8:00–18:00, sábado 8:00–13:00, domingo cerrado. */
export function franjasDelDia(fecha: string): string[] {
  const dia = diaDeLaSemana(fecha);
  if (dia === 0) return [];
  const ultimaHora = dia === 6 ? 12 : 17;
  const franjas: string[] = [];
  for (let h = 8; h <= ultimaHora; h++) {
    const hh = String(h).padStart(2, "0");
    franjas.push(`${hh}:00`, `${hh}:30`);
  }
  return franjas;
}

/** 0 = domingo … 6 = sábado, para una fecha de calendario YYYY-MM-DD. */
export function diaDeLaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function esFechaValida(fecha: string): boolean {
  if (!REGEX_FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** Fecha y hora actuales en Bogotá, como { fecha: YYYY-MM-DD, hora: HH:MM }. */
export function ahoraEnBogota(ahora: Date): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(ahora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return { fecha: `${p("year")}-${p("month")}-${p("day")}`, hora: `${p("hour")}:${p("minute")}` };
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function validarNuevaCita(entrada: unknown, ahora: Date): Resultado<NuevaCita> {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, errores: ["El cuerpo de la solicitud debe ser un objeto JSON."] };
  }
  const e = entrada as Record<string, unknown>;
  const errores: string[] = [];

  const duenoNombre = texto(e.duenoNombre);
  const duenoEmail = texto(e.duenoEmail).toLowerCase();
  const duenoTelefono = texto(e.duenoTelefono);
  const mascotaNombre = texto(e.mascotaNombre);
  const especie = texto(e.especie).toLowerCase();
  const fecha = texto(e.fecha);
  const hora = texto(e.hora);
  const motivo = texto(e.motivo);

  if (duenoNombre.length < 3 || duenoNombre.length > 80) {
    errores.push("El nombre del dueño debe tener entre 3 y 80 caracteres.");
  }
  if (!REGEX_EMAIL.test(duenoEmail) || duenoEmail.length > 120) {
    errores.push("El correo electrónico no es válido.");
  }
  const digitos = duenoTelefono.replace(/[\s+()-]/g, "");
  if (!/^\d{7,15}$/.test(digitos)) {
    errores.push("El teléfono debe tener entre 7 y 15 dígitos.");
  }
  if (mascotaNombre.length < 1 || mascotaNombre.length > 40) {
    errores.push("El nombre de la mascota debe tener entre 1 y 40 caracteres.");
  }
  if (!(ESPECIES as readonly string[]).includes(especie)) {
    errores.push(`La especie debe ser una de: ${ESPECIES.join(", ")}.`);
  }
  if (motivo.length < 3 || motivo.length > 300) {
    errores.push("El motivo de la consulta debe tener entre 3 y 300 caracteres.");
  }
  if (e.aceptaTratamientoDatos !== true) {
    errores.push("Debe aceptar la política de tratamiento de datos personales (Ley 1581 de 2012).");
  }

  if (!esFechaValida(fecha)) {
    errores.push("La fecha debe tener el formato AAAA-MM-DD.");
  } else if (!REGEX_HORA.test(hora)) {
    errores.push("La hora debe tener el formato HH:MM en franjas de 30 minutos.");
  } else {
    const hoy = ahoraEnBogota(ahora);
    const limite = sumarDias(hoy.fecha, DIAS_MAXIMOS_ANTICIPACION);
    if (fecha < hoy.fecha || (fecha === hoy.fecha && hora <= hoy.hora)) {
      errores.push("La cita debe ser en una fecha y hora futuras.");
    } else if (fecha > limite) {
      errores.push(`Solo se pueden agendar citas hasta ${DIAS_MAXIMOS_ANTICIPACION} días adelante.`);
    } else if (diaDeLaSemana(fecha) === 0) {
      errores.push("La veterinaria no atiende los domingos.");
    } else if (!franjasDelDia(fecha).includes(hora)) {
      errores.push("La hora está fuera del horario de atención (L-V 8:00-18:00, sábado 8:00-13:00).");
    }
  }

  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    valor: {
      duenoNombre,
      duenoEmail,
      duenoTelefono,
      mascotaNombre,
      especie: especie as Especie,
      fecha,
      hora,
      motivo
    }
  };
}

export function crearCita(datos: NuevaCita, id: string, ahora: Date): Cita {
  return {
    ...datos,
    id,
    estado: "agendada",
    creadaEn: ahora.toISOString(),
    consentimiento: { aceptado: true, fecha: ahora.toISOString(), versionPolitica: VERSION_POLITICA_DATOS }
  };
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => `${parte[0]!.toUpperCase()}.`)
    .join(" ");
}

export function vistaPublica(cita: Cita): CitaPublica {
  return {
    id: cita.id,
    fecha: cita.fecha,
    hora: cita.hora,
    mascotaNombre: cita.mascotaNombre,
    especie: cita.especie,
    motivo: cita.motivo,
    duenoIniciales: iniciales(cita.duenoNombre),
    estado: cita.estado
  };
}

export function ordenarCitas<T extends { fecha: string; hora: string }>(citas: T[]): T[] {
  return [...citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}
