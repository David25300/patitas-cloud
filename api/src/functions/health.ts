import { app, HttpResponseInit } from "@azure/functions";
import { obtenerRepositorio } from "../repo/citasRepository";

app.http("health", {
  methods: ["GET"],
  route: "health",
  authLevel: "anonymous",
  handler: async (): Promise<HttpResponseInit> => ({
    status: 200,
    jsonBody: {
      estado: "ok",
      ambiente: process.env.APP_ENV ?? "local",
      version: process.env.APP_VERSION ?? "local",
      almacenamiento: obtenerRepositorio().tipo
    }
  })
});
