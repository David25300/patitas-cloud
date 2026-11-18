# Configuración inicial (una sola vez) para que GitHub Actions despliegue en Azure con OIDC.
# Es el único paso manual del proyecto: después todo se despliega desde el pipeline.
# Requisitos: az login (Propietario de la suscripción) y gh auth login.
param(
  [string]$Repo = "David25300/patitas-cloud",
  [string]$ResourceGroup = "rg-patitas",
  [string]$Location = "eastus2",
  [string]$Identity = "id-patitas-github",
  [Parameter(Mandatory = $true)][string]$AlertEmail
)
$ErrorActionPreference = "Stop"

function Invoke-Az {
  az @args
  if ($LASTEXITCODE -ne 0) { throw "Falló: az $args" }
}

$subscriptionId = az account show --query id -o tsv
$tenantId = az account show --query tenantId -o tsv
Write-Host "Suscripción $subscriptionId"

# 1. Proveedores de recursos. La identidad del pipeline solo tiene permisos sobre el grupo
#    de recursos y no puede registrarlos por su cuenta.
foreach ($p in "Microsoft.Web", "Microsoft.DocumentDB", "Microsoft.Insights",
               "Microsoft.OperationalInsights", "Microsoft.AlertsManagement", "Microsoft.ManagedIdentity") {
  Invoke-Az provider register --namespace $p --output none
}

# 2. Grupo de recursos del proyecto.
Invoke-Az group create --name $ResourceGroup --location $Location --tags proyecto=patitas curso=penu --output none

# 3. Identidad administrada que usa GitHub Actions (no hay contraseñas ni secretos de cliente).
Invoke-Az identity create --name $Identity --resource-group $ResourceGroup --location $Location `
  --tags proyecto=patitas curso=penu --output none
$clientId = az identity show --name $Identity --resource-group $ResourceGroup --query clientId -o tsv
$principalId = az identity show --name $Identity --resource-group $ResourceGroup --query principalId -o tsv

# 4. Federated credentials: solo los jobs de los environments dev y prod de este repositorio
#    pueden pedir un token de Azure.
foreach ($ambiente in "dev", "prod") {
  Invoke-Az identity federated-credential create --name "github-$ambiente" `
    --identity-name $Identity --resource-group $ResourceGroup `
    --issuer "https://token.actions.githubusercontent.com" `
    --subject "repo:${Repo}:environment:$ambiente" `
    --audiences "api://AzureADTokenExchange" --output none
}

# 5. Mínimo privilegio: Contributor solo sobre el grupo de recursos.
Invoke-Az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal `
  --role Contributor --scope "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup" --output none

# 6. GitHub: identificadores como secrets, correo de alertas como variable y los dos environments.
gh secret set AZURE_CLIENT_ID --repo $Repo --body $clientId
gh secret set AZURE_TENANT_ID --repo $Repo --body $tenantId
gh secret set AZURE_SUBSCRIPTION_ID --repo $Repo --body $subscriptionId
gh variable set ALERT_EMAIL --repo $Repo --body $AlertEmail
gh api --method PUT "repos/$Repo/environments/dev" --silent
gh api --method PUT "repos/$Repo/environments/prod" --silent

Write-Host "Listo. Identidad $Identity (clientId $clientId) con Contributor sobre $ResourceGroup."
