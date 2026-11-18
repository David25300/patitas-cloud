// Lógica de los endpoints, separada de Azure Functions para poder probarla sin el runtime.
import {
  ahoraEnBogota,
  crearCita,
  esFechaValida,
  franjasDelDia,
  ordenarCitas,
  validarNuevaCita,
  vistaPublica
} from "../domain/cita";
import { CitasRepository, FranjaOcupadaError } from "../repo/citasRepository";

export interface Dependencias {
  repo: CitasRepository;
  ahora: () => Date;
  nuevoId: () => string;
}

export interface Respuesta {
  status: number;
  jsonBody: unknown;
}

export const LIMITE_LISTADO = 200;

export async function agendarCita(cuerpo: unknown, deps: Dependencias): Promise<Respuesta> {
  const ahora = deps.ahora();
  const validacion = validarNuevaCita(cuerpo, ahora);
  if (!validacion.ok) {
    return { status: 400, jsonBody: { mensaje: "Datos inválidos.", errores: validacion.errores } };
  }
  const cita = crearCita(validacion.valor, deps.nuevoId(), ahora);
  try {
    await deps.repo.crear(cita);
  } catch (error) {
    if (error instanceof FranjaOcupadaError) {
      return {
        status: 409,
        jsonBody: { mensaje: `Ya hay una cita el ${cita.fecha} a las ${cita.hora}. Elija otra hora.` }
      };
    }
    throw error;
  }
  return { status: 201, jsonBody: { mensaje: "Cita agendada.", cita: vistaPublica(cita) } };
}

export async function listarCitas(fecha: string | null, deps: Dependencias): Promise<Respuesta> {
  if (fecha && !esFechaValida(fecha)) {
    return { status: 400, jsonBody: { mensaje: "El parámetro fecha debe tener el formato AAAA-MM-DD." } };
  }
  const hoy = ahoraEnBogota(deps.ahora()).fecha;
  const citas = await deps.repo.listar(
    fecha ? { fecha, limite: LIMITE_LISTADO } : { desde: hoy, limite: LIMITE_LISTADO }
  );
  const publicas = ordenarCitas(citas).map(vistaPublica);
  return { status: 200, jsonBody: { total: publicas.length, citas: publicas } };
}

export async function franjasDisponibles(fecha: string | null, deps: Dependencias): Promise<Respuesta> {
  if (!fecha || !esFechaValida(fecha)) {
    return { status: 400, jsonBody: { mensaje: "El parámetro fecha es obligatorio (AAAA-MM-DD)." } };
  }
  const ahora = ahoraEnBogota(deps.ahora());
  const ocupadas = new Set((await deps.repo.listar({ fecha, limite: LIMITE_LISTADO })).map((c) => c.hora));
  const disponibles = franjasDelDia(fecha).filter(
    (hora) => !ocupadas.has(hora) && (fecha > ahora.fecha || (fecha === ahora.fecha && hora > ahora.hora))
  );
  return { status: 200, jsonBody: { fecha, disponibles } };
}
