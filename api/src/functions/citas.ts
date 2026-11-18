import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { agendarCita, Dependencias, franjasDisponibles, listarCitas } from "../handlers/citas";
import { obtenerRepositorio } from "../repo/citasRepository";

function dependencias(): Dependencias {
  return { repo: obtenerRepositorio(), ahora: () => new Date(), nuevoId: () => randomUUID() };
}

const ERROR_INTERNO: HttpResponseInit = {
  status: 500,
  jsonBody: { mensaje: "Ocurrió un error inesperado. Intente de nuevo más tarde." }
};

app.http("citas", {
  methods: ["GET", "POST"],
  route: "citas",
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      if (request.method === "GET") {
        return await listarCitas(request.query.get("fecha"), dependencias());
      }
      let cuerpo: unknown;
      try {
        cuerpo = await request.json();
      } catch {
        return { status: 400, jsonBody: { mensaje: "El cuerpo debe ser JSON válido." } };
      }
      const respuesta = await agendarCita(cuerpo, dependencias());
      // Solo se registran datos no personales (Ley 1581).
      context.log(`agendarCita status=${respuesta.status}`);
      return respuesta;
    } catch (error) {
      context.error("Error en /api/citas", error);
      return ERROR_INTERNO;
    }
  }
});

app.http("franjas", {
  methods: ["GET"],
  route: "franjas",
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      return await franjasDisponibles(request.query.get("fecha"), dependencias());
    } catch (error) {
      context.error("Error en /api/franjas", error);
      return ERROR_INTERNO;
    }
  }
});
