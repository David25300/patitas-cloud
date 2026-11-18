import { CosmosClient, Container } from "@azure/cosmos";
import type { Cita } from "../domain/cita";

/** Se lanza cuando ya existe una cita en la misma fecha y hora. */
export class FranjaOcupadaError extends Error {
  constructor() {
    super("La franja ya está ocupada.");
    this.name = "FranjaOcupadaError";
  }
}

export interface CitasRepository {
  readonly tipo: "cosmos" | "memoria";
  crear(cita: Cita): Promise<void>;
  /** Citas de una fecha, o todas desde `desde` si no se pasa fecha. */
  listar(filtro: { fecha?: string; desde?: string; limite: number }): Promise<Cita[]>;
}

/** Repositorio en memoria: pruebas y desarrollo local sin Cosmos DB. */
export class MemoriaCitasRepository implements CitasRepository {
  readonly tipo = "memoria" as const;
  private readonly citas: Cita[] = [];

  async crear(cita: Cita): Promise<void> {
    if (this.citas.some((c) => c.fecha === cita.fecha && c.hora === cita.hora)) {
      throw new FranjaOcupadaError();
    }
    this.citas.push(cita);
  }

  async listar(filtro: { fecha?: string; desde?: string; limite: number }): Promise<Cita[]> {
    return this.citas
      .filter((c) => (filtro.fecha ? c.fecha === filtro.fecha : !filtro.desde || c.fecha >= filtro.desde))
      .slice(0, filtro.limite);
  }
}

/**
 * Repositorio en Cosmos DB for NoSQL.
 * Contenedor particionado por /fecha con unique key /hora: la base de datos
 * garantiza que no haya dos citas en la misma franja aunque lleguen a la vez.
 */
export class CosmosCitasRepository implements CitasRepository {
  readonly tipo = "cosmos" as const;

  constructor(private readonly container: Container) {}

  async crear(cita: Cita): Promise<void> {
    try {
      await this.container.items.create(cita);
    } catch (error) {
      if ((error as { code?: number }).code === 409) throw new FranjaOcupadaError();
      throw error;
    }
  }

  async listar(filtro: { fecha?: string; desde?: string; limite: number }): Promise<Cita[]> {
    const query = filtro.fecha
      ? {
          query: "SELECT TOP @limite * FROM c WHERE c.fecha = @fecha",
          parameters: [
            { name: "@fecha", value: filtro.fecha },
            { name: "@limite", value: filtro.limite }
          ]
        }
      : {
          query: "SELECT TOP @limite * FROM c WHERE c.fecha >= @desde",
          parameters: [
            { name: "@desde", value: filtro.desde ?? "0000-00-00" },
            { name: "@limite", value: filtro.limite }
          ]
        };
    const { resources } = await this.container.items.query<Cita>(query).fetchAll();
    return resources;
  }
}

let instancia: CitasRepository | undefined;

/** Usa Cosmos DB si hay configuración; si no, memoria (solo para local). */
export function obtenerRepositorio(env: NodeJS.ProcessEnv = process.env): CitasRepository {
  if (instancia) return instancia;
  const { COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_CONTAINER } = env;
  if (COSMOS_ENDPOINT && COSMOS_KEY && COSMOS_DATABASE && COSMOS_CONTAINER) {
    const cliente = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    instancia = new CosmosCitasRepository(cliente.database(COSMOS_DATABASE).container(COSMOS_CONTAINER));
  } else {
    instancia = new MemoriaCitasRepository();
  }
  return instancia;
}
