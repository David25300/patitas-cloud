# Veterinaria Patitas · Agenda de citas en Azure

MVP del proyecto **Arquitectura Cloud para una PyME** (PENU 2026-2, Escuela Colombiana de Ingeniería Julio Garavito).

La veterinaria "Patitas" necesita que sus clientes puedan **agendar una cita y consultar las citas** desde la web, con los datos personales protegidos (Ley 1581 de 2012), respaldo diario y monitoreo. El MVP se despliega en Azure for Students únicamente desde GitHub Actions.

## Arquitectura del MVP

```
Navegador ──HTTPS──► Azure Static Web Apps (Free)
                       ├─ Frontend estático (web/)
                       └─ API administrada: Azure Functions Node 22 (api/)
                              │  llave inyectada por IaC en los app settings
                              ▼
                     Azure Cosmos DB for NoSQL (free tier, backup continuo 7 días)
                              │
             Application Insights + Log Analytics ──► alerta por correo (Action Group)
```

| Capa | Servicio | Por qué |
|---|---|---|
| Presentación | Azure Static Web Apps (Free) | HTTPS y CDN incluidos, sin servidores que administrar |
| Lógica | Azure Functions (API administrada de SWA), Node.js 22 + TypeScript | Escala a cero y absorbe picos de 3x sin configuración |
| Datos | Azure Cosmos DB for NoSQL, free tier | 1000 RU/s y 25 GB gratis; respaldo continuo con restauración a un punto en el tiempo |
| Observabilidad | Application Insights + Log Analytics | Logs centralizados, métricas y alerta de errores HTTP |
| IaC | Bicep (`infra/`) | Mismo template para dev y prod |
| CI/CD | GitHub Actions + OIDC | Sin credenciales guardadas en el repositorio |

Región: **East US 2** (permitida por Azure for Students y soportada por Static Web Apps).

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/citas` | Agenda una cita. Valida horario, franjas de 30 min y consentimiento de datos. Responde `409` si la franja está ocupada |
| `GET` | `/api/citas?fecha=AAAA-MM-DD` | Lista las citas de una fecha (o las próximas). Solo muestra las iniciales del dueño |
| `GET` | `/api/franjas?fecha=AAAA-MM-DD` | Horas disponibles de un día |
| `GET` | `/api/health` | Estado, ambiente y versión desplegada |

Horario: lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 13:00. Las citas se pueden agendar hasta 60 días adelante. Cosmos DB garantiza una sola cita por franja con una *unique key* (`/hora` dentro de la partición `/fecha`).

## Estructura

```
api/            Azure Functions (TypeScript): dominio, handlers, repositorio y pruebas
web/            Frontend estático + staticwebapp.config.json (cabeceras de seguridad)
infra/          Bicep y parámetros por ambiente
scripts/        smoke-test.sh
.github/        Workflows de CI/CD, rollback, CodeQL y Dependabot
docs/           HLD, diagramas, costos y presentación
```

## Entregables

| Entregable | Dónde |
|---|---|
| HLD con 5 ADR | [docs/HLD-Veterinaria-Patitas.pdf](docs/HLD-Veterinaria-Patitas.pdf) |
| Diagramas (draw.io + PNG) | [docs/diagramas/](docs/diagramas/) |
| Costos y FinOps | [docs/costos/costos-patitas.xlsx](docs/costos/costos-patitas.xlsx) · [calculadora oficial de Azure](https://azure.com/e/4825d259dd8444e7afac1b11d2e23315) ([export](docs/costos/calculadora-azure-produccion.xlsx)) |
| Diseño de despliegue | Sección 9 del HLD y [diagrama del pipeline](docs/diagramas/04-pipeline-despliegue.png) |
| Código, workflow e IaC | [api/](api/), [web/](web/), [.github/workflows/](.github/workflows/), [infra/](infra/) |
| Presentación | [docs/presentacion/Patitas-sustentacion.pptx](docs/presentacion/Patitas-sustentacion.pptx) |

## Correr en local

Requisitos: Node.js 22, [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local) y la CLI de Static Web Apps.

```bash
cd api
npm install
npm test            # pruebas unitarias
npm run build
cp local.settings.example.json local.settings.json
cd ..
npx @azure/static-web-apps-cli start web --api-location api
```

Sin variables de Cosmos DB la API usa un repositorio en memoria, así que se puede probar sin conexión a Azure.

## Pipeline

```
push / PR ─► build + lint + typecheck + pruebas + validar Bicep ─► deploy (Bicep + SWA) ─► smoke test
                 └─ Checkov (IaC) y CodeQL en paralelo
```

| Evento | Qué pasa |
|---|---|
| Pull request a `develop` o `main` | Solo build, lint, pruebas, Checkov y CodeQL. Si una prueba falla no se puede desplegar |
| Push a `develop` | Despliegue al ambiente **dev** (`swa-patitas-dev`) |
| Push a `main` (merge del PR desde `develop`) | Despliegue al ambiente **prod** (`swa-patitas-prod`) |
| Manual: *Rollback* | Vuelve a desplegar un commit anterior en dev o prod |

El smoke test verifica que `/api/health` responda con el SHA recién desplegado, que la API use Cosmos DB, que el listado funcione, que la validación responda `400` y que HTTP redirija a HTTPS.

### Secretos e identidad

La configuración inicial se hace una sola vez con [`scripts/bootstrap-azure.ps1`](scripts/bootstrap-azure.ps1) (registra los proveedores, crea la identidad, las federated credentials, el rol y los secrets de GitHub). Todo lo demás lo despliega el pipeline.

- GitHub Actions entra a Azure con **OIDC** (federated credentials sobre una identidad administrada asignada por el usuario), con rol *Contributor* solo sobre `rg-patitas`.
- En GitHub solo se guardan identificadores: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (secrets) y `ALERT_EMAIL` (variable).
- La llave de Cosmos DB nunca está en el repositorio: Bicep la lee con `listKeys()` y la escribe en los app settings de Static Web Apps.
- El token de despliegue de Static Web Apps se pide en cada ejecución y se enmascara en los logs.

### Rollback

1. **Rápido:** *Actions → Rollback → Run workflow*, elegir el ambiente y el SHA del último commit que funcionaba.
2. **Por código:** `git revert` del commit problemático en `main`; el pipeline despliega la corrección.

## Limpieza

Después de la sustentación:

```bash
az group delete --name rg-patitas --yes
```
