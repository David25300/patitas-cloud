import { describe, expect, it } from "vitest";
import {
  ahoraEnBogota,
  crearCita,
  esFechaValida,
  franjasDelDia,
  iniciales,
  validarNuevaCita,
  vistaPublica
} from "../src/domain/cita";

// Miércoles 18 de noviembre de 2026, 10:00 a. m. en Bogotá (UTC-5).
const AHORA = new Date("2026-11-18T15:00:00Z");

const valida = {
  duenoNombre: "Laura Gómez",
  duenoEmail: "Laura@Example.com",
  duenoTelefono: "+57 300 123 4567",
  mascotaNombre: "Toby",
  especie: "Perro",
  fecha: "2026-11-20",
  hora: "09:00",
  motivo: "Vacuna anual",
  aceptaTratamientoDatos: true
};

describe("validarNuevaCita", () => {
  it("acepta una cita válida y normaliza correo y especie", () => {
    const r = validarNuevaCita(valida, AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.duenoEmail).toBe("laura@example.com");
      expect(r.valor.especie).toBe("perro");
    }
  });

  it("rechaza si no se acepta la política de datos (Ley 1581)", () => {
    const r = validarNuevaCita({ ...valida, aceptaTratamientoDatos: false }, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join()).toMatch(/Ley 1581/);
  });

  it.each([
    ["correo inválido", { duenoEmail: "laura@" }, /correo/],
    ["teléfono corto", { duenoTelefono: "123" }, /teléfono/],
    ["especie desconocida", { especie: "dragón" }, /especie/],
    ["nombre vacío", { duenoNombre: "  " }, /nombre del dueño/],
    ["motivo vacío", { motivo: "" }, /motivo/]
  ])("rechaza %s", (_caso, cambio, mensaje) => {
    const r = validarNuevaCita({ ...valida, ...cambio }, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join()).toMatch(mensaje);
  });

  it.each([
    ["una hora pasada de hoy", "2026-11-18", "09:30", /futuras/],
    ["un día pasado", "2026-11-17", "10:00", /futuras/],
    ["un domingo", "2026-11-22", "10:00", /domingos/],
    ["un sábado después de mediodía", "2026-11-21", "13:00", /horario/],
    ["antes de abrir", "2026-11-20", "07:30", /horario/],
    ["más de 60 días adelante", "2027-01-18", "10:00", /60 días/],
    ["una hora que no es franja de 30 min", "2026-11-20", "09:15", /HH:MM/],
    ["una fecha que no existe", "2026-02-30", "09:00", /AAAA-MM-DD/]
  ])("rechaza %s", (_caso, fecha, hora, mensaje) => {
    const r = validarNuevaCita({ ...valida, fecha, hora }, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join()).toMatch(mensaje);
  });

  it("acepta una franja posterior a la hora actual del mismo día", () => {
    expect(validarNuevaCita({ ...valida, fecha: "2026-11-18", hora: "10:30" }, AHORA).ok).toBe(true);
  });

  it("acepta el sábado a las 12:30", () => {
    expect(validarNuevaCita({ ...valida, fecha: "2026-11-21", hora: "12:30" }, AHORA).ok).toBe(true);
  });

  it("rechaza un cuerpo que no es objeto", () => {
    expect(validarNuevaCita("hola", AHORA).ok).toBe(false);
    expect(validarNuevaCita(null, AHORA).ok).toBe(false);
  });
});

describe("utilidades de fecha", () => {
  it("convierte a hora de Bogotá aunque en UTC ya sea otro día", () => {
    expect(ahoraEnBogota(new Date("2026-11-18T04:30:00Z"))).toEqual({ fecha: "2026-11-17", hora: "23:30" });
  });

  it("valida fechas de calendario reales", () => {
    expect(esFechaValida("2028-02-29")).toBe(true);
    expect(esFechaValida("2026-02-29")).toBe(false);
    expect(esFechaValida("18/11/2026")).toBe(false);
  });

  it("calcula las franjas por día", () => {
    expect(franjasDelDia("2026-11-20")).toHaveLength(20); // viernes 8:00–17:30
    expect(franjasDelDia("2026-11-21")).toHaveLength(10); // sábado 8:00–12:30
    expect(franjasDelDia("2026-11-22")).toHaveLength(0); // domingo
  });
});

describe("vistaPublica", () => {
  it("no expone correo ni teléfono del dueño", () => {
    const r = validarNuevaCita(valida, AHORA);
    if (!r.ok) throw new Error("debería ser válida");
    const publica = vistaPublica(crearCita(r.valor, "abc", AHORA));
    expect(publica).not.toHaveProperty("duenoEmail");
    expect(publica).not.toHaveProperty("duenoTelefono");
    expect(publica).not.toHaveProperty("duenoNombre");
    expect(publica.duenoIniciales).toBe("L. G.");
  });

  it("calcula iniciales con espacios de sobra", () => {
    expect(iniciales("  ana   maría  pérez ")).toBe("A. M.");
  });
});
