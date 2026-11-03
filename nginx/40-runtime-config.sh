#!/bin/sh
# Genera config.js con las URLs del backend a partir de las variables de entorno.
# Sin API_URL ni SOCKET_URL el frontend usa el mismo dominio y nginx reenvía al backend.
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.__UML_STUDIO_CONFIG__ = {
  apiUrl: "${API_URL:-}",
  socketUrl: "${SOCKET_URL:-}"
};
EOF
