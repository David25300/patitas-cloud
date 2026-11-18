// Infraestructura de la Veterinaria Patitas (un ambiente por despliegue: dev o prod).
// Se despliega desde GitHub Actions sobre el grupo de recursos rg-patitas.
targetScope = 'resourceGroup'

@description('Ambiente a desplegar.')
@allowed([
  'dev'
  'prod'
])
param env string

@description('Región. Static Web Apps solo existe en algunas regiones; East US 2 es la que coincide con las permitidas en Azure for Students.')
param location string = resourceGroup().location

@description('Correo que recibe las alertas de monitoreo.')
param alertEmail string

@description('Versión desplegada (SHA del commit). Se muestra en /api/health.')
param appVersion string = 'manual'

@description('RU/s de la base de datos del ambiente. Dev (400) + prod (400) caben en las 1000 RU/s gratis del free tier.')
@minValue(400)
param cosmosThroughput int = 400

var nombre = 'patitas'
var sufijo = uniqueString(resourceGroup().id)
var tags = {
  proyecto: nombre
  ambiente: env
  curso: 'penu'
}

// ---------- Observabilidad ----------

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${nombre}-${env}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      // Tope diario de ingesta para que un error no se coma los créditos (FinOps).
      dailyQuotaGb: json('0.5')
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${nombre}-${env}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    IngestionMode: 'LogAnalytics'
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${nombre}-${env}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'pat-${env}'
    enabled: true
    emailReceivers: [
      {
        name: 'administrador'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource alertaErrores 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${nombre}-${env}-errores-http'
  location: 'global'
  tags: tags
  properties: {
    description: 'Más de 5 solicitudes fallidas a la API en 5 minutos.'
    severity: 2
    enabled: true
    scopes: [
      appInsights.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'solicitudes-fallidas'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'requests/failed'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Count'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ---------- Datos ----------
// Una sola cuenta de Cosmos DB para dev y prod: Azure permite una cuenta free tier por suscripción.
// Cada ambiente tiene su propia base de datos.

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-08-15' = {
  name: 'cosmos-${nombre}-${sufijo}'
  location: location
  kind: 'GlobalDocumentDB'
  tags: {
    proyecto: nombre
    ambiente: 'compartido'
    curso: 'penu'
  }
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    backupPolicy: {
      // Respaldo continuo con restauración a un punto en el tiempo (7 días, sin costo).
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
    minimalTlsVersion: 'Tls12'
    disableKeyBasedMetadataWriteAccess: true
    publicNetworkAccess: 'Enabled'
  }
}

resource baseDatos 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-08-15' = {
  parent: cosmos
  name: '${nombre}-${env}'
  properties: {
    resource: {
      id: '${nombre}-${env}'
    }
    options: {
      throughput: cosmosThroughput
    }
  }
}

resource contenedorCitas 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  parent: baseDatos
  name: 'citas'
  properties: {
    resource: {
      id: 'citas'
      partitionKey: {
        paths: [
          '/fecha'
        ]
        kind: 'Hash'
      }
      // Una sola cita por franja: la hora es única dentro de cada fecha (partición).
      uniqueKeyPolicy: {
        uniqueKeys: [
          {
            paths: [
              '/hora'
            ]
          }
        ]
      }
    }
  }
}

// ---------- Aplicación ----------

resource web 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-${nombre}-${env}'
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

// La API administrada de Static Web Apps no admite identidad administrada,
// así que la llave de Cosmos se inyecta aquí al desplegar: nunca está en el repositorio.
resource webSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: web
  name: 'appsettings'
  properties: {
    APP_ENV: env
    APP_VERSION: appVersion
    COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
    COSMOS_KEY: cosmos.listKeys().primaryMasterKey
    COSMOS_DATABASE: baseDatos.name
    COSMOS_CONTAINER: contenedorCitas.name
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  }
}

output staticWebAppName string = web.name
output staticWebAppHostname string = web.properties.defaultHostname
output cosmosAccountName string = cosmos.name
output appInsightsName string = appInsights.name
