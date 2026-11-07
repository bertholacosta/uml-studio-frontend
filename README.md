# UML Studio · Frontend

Cliente web de **UML Studio**, un editor colaborativo de diagramas de clases UML con asistente de IA y generación de código.
Está hecho con Angular y Foblex Flow y se conecta a la API del repositorio del backend (`sw1_parcial1_backend`).

## Funcionalidades

- **Editor a pantalla completa** con herramientas flotantes:
  - Arrastra una clase desde la paleta y edítala en un panel lateral: nombre, atributos (nombre y tipo) y métodos, con cambios en vivo.
  - Relaciones de borde a borde: asociación, agregación, composición, herencia, dependencia, realización y clase de asociación, con multiplicidades y nombre.
  - Deshacer y rehacer, copiar y pegar, duplicar, zoom, ajustar a la pantalla y atajos de teclado.
  - Lienzo claro (estilo UML clásico) u oscuro.
  - **Guardado automático**: cada cambio se guarda solo 1,5 s después de dejar de editar (o cada 8 s si no se para). Junto al nombre del diagrama se ve si está guardado, guardándose o sin guardar. Si falla, se reintenta solo; al cambiar de diagrama o cerrar la pestaña se guarda lo pendiente. `Ctrl + S` guarda al instante.
- **Colaboración en tiempo real**: ves quién está conectado, sus cursores y lo que mueve; una clase queda bloqueada mientras otra persona la edita.
- **Compartir**: invita por correo con rol de propietario, editor o lector, gestiona los miembros del proyecto y copia el enlace del diagrama.
- **Chat del equipo con Trazo** (estilo Slack), con el modelo de IA propio que sirve el backend:
  - Pestaña **Equipo**: el canal del proyecto, en tiempo real para todos, con el nombre y el color de cada persona. **Trazo es un miembro más** que solo responde cuando se le menciona con **@Trazo**.
  - Pestaña **Trazo 🔒**: conversación privada con Trazo; nadie más la ve.
  - Autocompletado al escribir **@** (personas y Trazo) y **#** (diagramas del proyecto, para indicar en qué lienzo trabajar). Las menciones a ti se resaltan.
  - Trazo responde a cada persona por su nombre; explica conceptos, revisa el diagrama, lo edita o deja **propuestas** que cualquier editor aplica con «Aplicar al diagrama» (los lectores pueden preguntar, pero no editar). Cada respuesta indica el **#Diagrama** en el que actuó, con un enlace para abrirlo.
  - Las conversaciones y los cambios de Trazo se guardan en el servidor: al volver otro día todo sigue ahí. Solo el administrador puede reiniciar el canal del equipo.
  - Se le puede escribir, dictar por voz o enviar la foto de un diagrama hecho a mano para digitalizarlo.
  - **Configurar Trazo** (botón de ajustes del chat): el equipo elige si Trazo aplica los cambios, siempre los propone o solo explica; si responde breve o como mentor; su creatividad y qué modelo usa. Lo cambian los editores, todos lo ven al momento y Trazo lo anuncia en el canal. Una etiqueta en el chat indica cuándo Trazo propone o solo explica.
- **Generar Full Stack**: vista previa navegable del código Spring Boot y Flutter generado a partir del diagrama, con resaltado de sintaxis y descarga en `.zip`.
- **Importar y exportar**: JSON y XMI 2.1 (Enterprise Architect); imagen en PNG, SVG y BMP.
- **Primeros pasos**: un recorrido guiado por el editor que se puede repetir desde la página de inicio.
- **Idiomas**: español e inglés.

## Tecnologías

| Área | Herramientas |
| --- | --- |
| Framework | Angular 22 (componentes standalone, signals) |
| Lienzo | Foblex Flow |
| Estilos | Tailwind CSS 4 |
| Tiempo real | Socket.IO |
| Iconos | ng-icons (Heroicons) |
| Pruebas | Vitest |

## Requisitos

- Node.js 24 o superior
- El backend de UML Studio en marcha en `http://localhost:4000`

## Puesta en marcha

```bash
npm install
npm start
```

Abre `http://localhost:4200`. Con el backend en modo desarrollo puedes entrar con el usuario de prueba **demo@example.com** / **Pass1234!**

La dirección del backend en desarrollo está en [`src/environments/environment.ts`](src/environments/environment.ts).

## Configuración en producción

La compilación de producción no lleva la dirección del backend dentro: la lee al cargar la página desde [`public/config.js`](public/config.js), así que la misma compilación sirve para cualquier servidor.

```js
window.__UML_STUDIO_CONFIG__ = {
  apiUrl: 'https://api.ejemplo.com/api',
  socketUrl: 'https://api.ejemplo.com/collaboration',
};
```

Si se deja vacío, la aplicación usa el mismo dominio (`/api` y `/collaboration`).

### Con Docker

La imagen compila la aplicación y la sirve con nginx, que además reenvía `/api` y `/socket.io` al backend.

```bash
docker build -t uml-studio-frontend .
docker run -p 8080:80 -e BACKEND_UPSTREAM=http://host.docker.internal:3000 uml-studio-frontend
```

| Variable | Descripción |
| --- | --- |
| `BACKEND_UPSTREAM` | Dirección interna del backend para el proxy de nginx (por defecto `http://api:3000`) |
| `API_URL`, `SOCKET_URL` | Opcionales: si el backend está en otro dominio, se escriben en `config.js` al arrancar |

### En AWS con GitHub Actions

- **CI** (`.github/workflows/ci.yml`): en cada pull request comprueba el formato, ejecuta las pruebas y compila para producción.
- **CD** (`.github/workflows/deploy.yml`): en cada push a `main` repite el CI, compila y sube el resultado a **S3**, y después invalida `index.html` y `config.js` en **CloudFront**. Los archivos con hash se guardan en caché un año; los de la versión anterior se borran al final, para no romper a quien tenga la página abierta.
- CloudFront sirve la aplicación y reenvía `/api` y `/socket.io` al backend, así que `config.js` queda vacío (mismo dominio).
- Las credenciales de AWS son temporales (OIDC); no hay claves guardadas en GitHub.

La infraestructura (S3, CloudFront y el rol del workflow) se crea con la plantilla `infra/uml-studio.yml` del repositorio del backend, cuyo README explica la puesta en marcha. Variables que necesita este repositorio: `AWS_REGION`, `AWS_ROLE_ARN`, `SITE_BUCKET` y `CLOUDFRONT_DISTRIBUTION_ID`.

## Estructura

```text
src/
├── environments/                 Direcciones del backend por entorno
├── styles.css                    Tokens de diseño y estilos globales
└── app/
    ├── app.routes.ts             Rutas con carga diferida
    ├── core/
    │   ├── components/           Cabecera y logotipo
    │   ├── guards/               Protección de rutas privadas
    │   ├── interceptors/         Envío del token JWT
    │   ├── i18n/                 Traducciones (es, en) y selector de idioma
    │   ├── services/             Clientes de la API, colaboración, XMI y exportación
    │   ├── tour/                 Recorrido guiado
    │   └── utils/
    └── features/
        ├── auth/                 Inicio de sesión y registro
        ├── dashboard/            Página de inicio
        ├── projects/             Lista de proyectos y diagramas
        └── diagrams/diagram-editor/
            └── components/       Paleta, paneles de clase y relación, Trazo, Compartir y generador
```

| Ruta | Pantalla |
| --- | --- |
| `/login`, `/register` | Acceso |
| `/dashboard` | Inicio |
| `/projects` | Proyectos y diagramas |
| `/diagram?diagramId=…&projectId=…` | Editor |

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm start` | Servidor de desarrollo en `http://localhost:4200` |
| `npm run build` | Compilación de producción en `dist/frontend` |
| `npm run watch` | Compilación de desarrollo continua |
| `npm test` | Pruebas unitarias con Vitest |
| `npm run format` | Formatear con Prettier |
