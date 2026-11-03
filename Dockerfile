# syntax=docker/dockerfile:1

# ---------- Compilación ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig*.json .postcssrc.json ./
COPY public ./public
COPY src ./src
RUN npm run build -- --configuration production

# ---------- Servidor estático ----------
FROM nginx:1.27-alpine
ENV BACKEND_UPSTREAM=http://api:3000 \
    NGINX_RESOLVER=127.0.0.11 \
    API_URL= \
    SOCKET_URL=

# nginx sustituye las variables de *.template y ejecuta los scripts de /docker-entrypoint.d al arrancar
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
