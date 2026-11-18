import { beforeEach, describe, expect, it } from "vitest";
import { agendarCita, Dependencias, franjasDisponibles, listarCitas } from "../src/handlers/citas";
import { MemoriaCitasRepository } from "../src/repo/citasRepository";

const AHORA = new Date("2026-11-18T15:00:00Z"); // miércoles 10:00 en Bogotá

function cuerpo(fecha: string, hora: string, mascotaNombre = "Toby") {
  return {
    duenoNombre: "Laura Gómez",
    duenoEmail: "laura@example.com",
    duenoTelefono: "3001234567",
    mascotaNombre,
    especie: "perro",
    fecha,
    hora,
    motivo: "Control general",
    aceptaTratamientoDatos: true
  };
}

let deps: Dependencias;

beforeEach(() => {
  let n = 0;
  deps = { repo: new MemoriaCitasRepository(), ahora: () => AHORA, nuevoId: () => `id-${++n}` };
});

describe("agendarCita", () => {
  it("responde 201 con la cita sin datos de contacto", async () => {
    const r = await agendarCita(cuerpo("2026-11-20", "09:00"), deps);
    expect(r.status).toBe(201);
    const body = r.jsonBody as { cita: Record<string, unknown> };
    expect(body.cita).toMatchObject({ id: "id-1", fecha: "2026-11-20", hora: "09:00", duenoIniciales: "L. G." });
    expect(body.cita).not.toHaveProperty("duenoEmail");
  });

  it("responde 409 si la franja ya está ocupada", async () => {
    await agendarCita(cuerpo("2026-11-20", "09:00"), deps);
    const r = await agendarCita(cuerpo("2026-11-20", "09:00", "Michi"), deps);
    expect(r.status).toBe(409);
  });

  it("responde 400 con la lista de errores", async () => {
    const r = await agendarCita({ ...cuerpo("2026-11-22", "09:00"), duenoEmail: "x" }, deps);
    expect(r.status).toBe(400);
    expect((r.jsonBody as { errores: string[] }).errores.length).toBeGreaterThanOrEqual(2);
  });
});

describe("listarCitas", () => {
  beforeEach(async () => {
    await agendarCita(cuerpo("2026-11-21", "08:00", "Luna"), deps);
    await agendarCita(cuerpo("2026-11-20", "15:00", "Max"), deps);
    await agendarCita(cuerpo("2026-11-20", "09:00", "Toby"), deps);
  });

  it("lista las próximas citas ordenadas por fecha y hora", async () => {
    const r = await listarCitas(null, deps);
    expect(r.status).toBe(200);
    const body = r.jsonBody as { total: number; citas: { mascotaNombre: string }[] };
    expect(body.total).toBe(3);
    expect(body.citas.map((c) => c.mascotaNombre)).toEqual(["Toby", "Max", "Luna"]);
  });

  it("filtra por fecha", async () => {
    const r = await listarCitas("2026-11-20", deps);
    expect((r.jsonBody as { total: number }).total).toBe(2);
  });

  it("responde 400 si la fecha no es válida", async () => {
    expect((await listarCitas("mañana", deps)).status).toBe(400);
  });
});

describe("franjasDisponibles", () => {
  it("quita las franjas ocupadas y las que ya pasaron hoy", async () => {
    await agendarCita(cuerpo("2026-11-18", "11:00"), deps);
    const r = await franjasDisponibles("2026-11-18", deps);
    const { disponibles } = r.jsonBody as { disponibles: string[] };
    expect(disponibles[0]).toBe("10:30");
    expect(disponibles).not.toContain("11:00");
    expect(disponibles).not.toContain("09:00");
  });

  it("no hay franjas el domingo", async () => {
    const r = await franjasDisponibles("2026-11-22", deps);
    expect((r.jsonBody as { disponibles: string[] }).disponibles).toEqual([]);
  });

  it("exige la fecha", async () => {
    expect((await franjasDisponibles(null, deps)).status).toBe(400);
  });
});
