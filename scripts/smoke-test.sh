#!/usr/bin/env bash
# Smoke test contra el sitio desplegado.
# Uso: scripts/smoke-test.sh https://<host> [version-esperada]
set -euo pipefail

URL="${1:?Uso: smoke-test.sh https://<host> [version-esperada]}"
URL="${URL%/}"
VERSION="${2:-}"
INTENTOS=20
ESPERA=15

echo "Probando $URL"

# 1. La API responde y ya corre la versión recién desplegada (el despliegue tarda en propagarse).
for i in $(seq 1 "$INTENTOS"); do
  if salud=$(curl -fsS --max-time 10 "$URL/api/health"); then
    echo "health: $salud"
    if [[ -z "$VERSION" || "$salud" == *"\"version\":\"$VERSION\""* ]]; then
      break
    fi
    echo "Aún responde la versión anterior ($i/$INTENTOS)"
  else
    echo "La API aún no responde ($i/$INTENTOS)"
  fi
  if [[ "$i" -eq "$INTENTOS" ]]; then
    echo "FALLÓ: /api/health no respondió con la versión esperada"
    exit 1
  fi
  sleep "$ESPERA"
done

if [[ "$salud" != *'"almacenamiento":"cosmos"'* ]]; then
  echo "FALLÓ: la API no está usando Cosmos DB"
  exit 1
fi

# 2. La página principal carga.
curl -fsS --max-time 10 "$URL/" | grep -q "Veterinaria Patitas" \
  || { echo "FALLÓ: la página principal no cargó"; exit 1; }

# 3. Listar citas funciona (lee de Cosmos DB).
curl -fsS --max-time 15 "$URL/api/citas" | grep -q '"citas"' \
  || { echo "FALLÓ: GET /api/citas"; exit 1; }

# 4. La validación responde 400 ante datos inválidos (no crea datos de prueba en producción).
codigo=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST -H "Content-Type: application/json" -d '{}' "$URL/api/citas")
[[ "$codigo" == "400" ]] || { echo "FALLÓ: POST inválido devolvió $codigo en vez de 400"; exit 1; }

# 5. HTTP redirige a HTTPS.
codigo_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${URL/https:/http:}/")
[[ "$codigo_http" =~ ^30[0-9]$ ]] || { echo "FALLÓ: HTTP no redirige a HTTPS ($codigo_http)"; exit 1; }

echo "Smoke test OK"
