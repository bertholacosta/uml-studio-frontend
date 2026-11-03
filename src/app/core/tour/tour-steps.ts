import { TourStep, TourTask } from './tour.model';

/** Tareas de «Primeros pasos» en Inicio, en el orden en que el recorrido las completa. */
export const TOUR_TASKS: TourTask[] = [
  {
    id: 'project',
    completesAfterStep: 'project-create',
    title: { es: 'Crea tu primer proyecto', en: 'Create your first project' },
    description: {
      es: 'Un espacio para tu diagrama y la configuración del código.',
      en: 'A space for your diagram and code settings.',
    },
  },
  {
    id: 'classes',
    completesAfterStep: 'edit-class-2',
    title: { es: 'Modela clases con atributos', en: 'Model classes with attributes' },
    description: {
      es: 'Libro y Autor, con sus campos y tipos.',
      en: 'Book and Author, with their fields and types.',
    },
  },
  {
    id: 'relation',
    completesAfterStep: 'connect',
    title: { es: 'Relaciona las clases', en: 'Relate the classes' },
    description: {
      es: 'Una asociación entre Libro y Autor.',
      en: 'An association between Book and Author.',
    },
  },
  {
    id: 'save',
    completesAfterStep: 'save',
    title: { es: 'Guarda el diagrama', en: 'Save the diagram' },
    description: {
      es: 'Conserva los cambios en el servidor.',
      en: 'Keep your changes on the server.',
    },
  },
  {
    id: 'generate',
    completesAfterStep: 'download',
    title: { es: 'Genera el código', en: 'Generate the code' },
    description: {
      es: 'Spring Boot y Flutter listos para descargar.',
      en: 'Spring Boot and Flutter ready to download.',
    },
  },
];

/**
 * Recorrido guiado de UML Studio.
 * Ejemplo conductor: un «Sistema de Biblioteca» con las clases Libro y Autor.
 */
export const TOUR_STEPS: TourStep[] = [
  // ---------------------------------------------------------------- Inicio y Proyectos
  {
    id: 'welcome',
    title: { es: 'Bienvenido a UML Studio', en: 'Welcome to UML Studio' },
    body: {
      es: 'En unos minutos vas a crear un proyecto real: un <strong>Sistema de Biblioteca</strong> con las clases <em>Libro</em> y <em>Autor</em>, relacionarlas y generar su código.<br><br>Durante el recorrido solo podrás usar el elemento resaltado. Puedes saltarlo cuando quieras.',
      en: 'In a few minutes you will create a real project: a <strong>Library System</strong> with the classes <em>Book</em> and <em>Author</em>, relate them and generate their code.<br><br>During the tour you can only use the highlighted element. You can skip it at any time.',
    },
    advance: { type: 'next' },
  },
  {
    id: 'go-projects',
    target: () => '[data-tour="nav-projects"]',
    title: { es: 'Ve a tus proyectos', en: 'Go to your projects' },
    body: {
      es: 'Desde <strong>Inicio</strong> sigues tu progreso en «Primeros pasos». Tus diagramas viven en <strong>Proyectos</strong>.',
      en: 'From <strong>Home</strong> you follow your progress in «Getting started». Your diagrams live in <strong>Projects</strong>.',
    },
    hint: { es: 'Haz clic en «Proyectos».', en: 'Click «Projects».' },
    advance: { type: 'event', event: 'projects-opened' },
  },
  {
    id: 'new-project',
    target: () => '[data-tour="new-project"]',
    title: { es: 'Crea tu primer proyecto', en: 'Create your first project' },
    body: {
      es: 'Cada proyecto agrupa un diagrama de clases y la configuración para generar código.',
      en: 'Each project groups a class diagram and the settings used to generate code.',
    },
    hint: { es: 'Haz clic en «Nuevo proyecto».', en: 'Click «New project».' },
    advance: { type: 'event', event: 'create-modal-opened' },
  },
  {
    id: 'project-name',
    target: () => '[data-tour="project-name"]',
    title: { es: 'Ponle un nombre', en: 'Give it a name' },
    body: {
      es: 'Escribe un nombre descriptivo, por ejemplo <strong>Sistema de Biblioteca</strong>.',
      en: 'Type a descriptive name, for example <strong>Library System</strong>.',
    },
    hint: { es: 'Escribe el nombre y pulsa «Siguiente».', en: 'Type the name and press «Next».' },
    advance: { type: 'input' },
    revert: { event: 'create-modal-closed', toStep: 'new-project' },
  },
  {
    id: 'project-create',
    target: () => '[data-tour="project-create"]',
    title: { es: 'Confirma la creación', en: 'Confirm' },
    body: {
      es: 'El paquete Java (<code>com.example.app</code>) y las versiones se pueden cambiar después.',
      en: 'The Java package (<code>com.example.app</code>) and versions can be changed later.',
    },
    hint: { es: 'Haz clic en «Crear proyecto».', en: 'Click «Create project».' },
    advance: { type: 'event', event: 'project-created' },
    revert: { event: 'create-modal-closed', toStep: 'new-project' },
  },
  {
    id: 'open-project',
    target: (ctx) => (ctx.projectId ? `[data-tour-project="${ctx.projectId}"]` : null),
    title: { es: 'Abre el proyecto', en: 'Open the project' },
    body: {
      es: 'Tu proyecto ya aparece en la lista. Ábrelo para entrar al editor de diagramas.',
      en: 'Your project now appears in the list. Open it to enter the diagram editor.',
    },
    hint: { es: 'Haz clic en la tarjeta del proyecto.', en: 'Click the project card.' },
    advance: { type: 'event', event: 'editor-ready' },
  },

  // ---------------------------------------------------------------- Editor
  {
    id: 'toolbox',
    target: () => '[data-tour="toolbox"]',
    title: { es: 'La barra de herramientas', en: 'The toolbar' },
    body: {
      es: 'Aquí están las herramientas: <strong>Clase</strong> y <strong>Relación</strong>, además de deshacer y rehacer. El botón de arriba muestra u oculta a <strong>Trazo</strong>, el asistente.',
      en: 'Here are the tools: <strong>Class</strong> and <strong>Relationship</strong>, plus undo and redo. The button on top shows or hides the assistant.',
    },
    advance: { type: 'next' },
  },
  {
    id: 'add-class-1',
    target: () => '[data-tour="add-class"]',
    title: { es: 'Crea la clase Libro', en: 'Create the Book class' },
    body: {
      es: 'Empecemos por la primera clase del sistema: <strong>Libro</strong>.',
      en: "Let's start with the first class of the system: <strong>Book</strong>.",
    },
    hint: {
      es: 'Arrastra el icono de Clase al lienzo o haz clic en él.',
      en: 'Drag the Class icon onto the canvas or click it.',
    },
    advance: { type: 'event', event: 'class-added' },
  },
  {
    id: 'open-class-1',
    target: (ctx) => (ctx.nodeIds[0] ? `[data-tour-node="${ctx.nodeIds[0]}"]` : null),
    title: { es: 'Edita la clase', en: 'Edit the class' },
    body: {
      es: 'La clase se creó con un nombre provisional. Ábrela para darle nombre y atributos.',
      en: 'The class was created with a temporary name. Open it to set its name and attributes.',
    },
    hint: { es: 'Haz doble clic sobre la clase.', en: 'Double-click the class.' },
    advance: { type: 'event', event: 'node-modal-opened' },
  },
  {
    id: 'edit-class-1',
    target: () => '[data-tour="node-modal"]',
    title: { es: 'Define Libro', en: 'Define Book' },
    body: {
      es: '1. Cambia el nombre a <strong>Libro</strong>.<br>2. Pulsa «Agregar atributo» y escribe <code>titulo</code> de tipo <code>String</code>.<br>3. Pulsa Enter para agregar otro: <code>anioPublicacion</code> de tipo <code>Integer</code>.',
      en: '1. Rename it to <strong>Book</strong>.<br>2. Press «Add attribute» and type <code>title</code> of type <code>String</code>.<br>3. Press Enter to add another one: <code>publicationYear</code> of type <code>Integer</code>.',
    },
    hint: {
      es: 'Los cambios se aplican al momento. Cuando termines, pulsa «Listo».',
      en: 'Changes apply instantly. When done, press «Done».',
    },
    advance: { type: 'event', event: 'node-saved' },
    revert: { event: 'node-modal-closed', toStep: 'open-class-1' },
  },
  {
    id: 'add-class-2',
    target: () => '[data-tour="add-class"]',
    title: { es: 'Crea la clase Autor', en: 'Create the Author class' },
    body: {
      es: 'Un libro tiene un autor. Crea una segunda clase para representarlo.',
      en: 'A book has an author. Create a second class to represent it.',
    },
    hint: {
      es: 'Arrastra el icono de Clase al lienzo o haz clic en él.',
      en: 'Drag the Class icon onto the canvas or click it.',
    },
    advance: { type: 'event', event: 'class-added' },
  },
  {
    id: 'open-class-2',
    target: (ctx) => (ctx.nodeIds[1] ? `[data-tour-node="${ctx.nodeIds[1]}"]` : null),
    title: { es: 'Edita la nueva clase', en: 'Edit the new class' },
    body: {
      es: 'Igual que antes: ábrela para completarla.',
      en: 'Same as before: open it to fill it in.',
    },
    hint: { es: 'Haz doble clic sobre la clase.', en: 'Double-click the class.' },
    advance: { type: 'event', event: 'node-modal-opened' },
  },
  {
    id: 'edit-class-2',
    target: () => '[data-tour="node-modal"]',
    title: { es: 'Define Autor', en: 'Define Author' },
    body: {
      es: '1. Cambia el nombre a <strong>Autor</strong>.<br>2. Agrega el atributo <code>nombre</code> de tipo <code>String</code>.<br>3. Agrega <code>nacionalidad</code> de tipo <code>String</code>.',
      en: '1. Rename it to <strong>Author</strong>.<br>2. Add the attribute <code>name</code> of type <code>String</code>.<br>3. Add <code>nationality</code> of type <code>String</code>.',
    },
    hint: {
      es: 'Los cambios se aplican al momento. Cuando termines, pulsa «Listo».',
      en: 'Changes apply instantly. When done, press «Done».',
    },
    advance: { type: 'event', event: 'node-saved' },
    revert: { event: 'node-modal-closed', toStep: 'open-class-2' },
  },
  {
    id: 'connect',
    target: () => '[data-tour="canvas"]',
    title: { es: 'Relaciona las clases', en: 'Relate the classes' },
    body: {
      es: 'Una <strong>asociación</strong> indica que un Libro está vinculado a un Autor. Pasa el ratón sobre <strong>Libro</strong> y arrastra desde uno de sus puntos hasta <strong>Autor</strong>. Luego, con doble clic en la línea, puedes cambiar el tipo y las multiplicidades.',
      en: 'An <strong>association</strong> means a Book is linked to an Author. Hover <strong>Book</strong> and drag from one of its dots to <strong>Author</strong>. Then double-click the line to change its type and multiplicities.',
    },
    hint: {
      es: 'Arrastra desde un punto de Libro hasta Autor.',
      en: 'Drag from a dot on Book to Author.',
    },
    advance: { type: 'event', event: 'connection-created' },
  },
  {
    id: 'save',
    target: () => '[data-tour="save"]',
    title: { es: 'Guarda el diagrama', en: 'Save the diagram' },
    body: {
      es: 'Los cambios se sincronizan en vivo con tu equipo, pero hay que guardarlos para conservarlos. También puedes usar <code>Ctrl + S</code>.',
      en: 'Changes sync live with your team, but you must save them to keep them. You can also use <code>Ctrl + S</code>.',
    },
    hint: { es: 'Haz clic en «Guardar».', en: 'Click «Save».' },
    advance: { type: 'event', event: 'diagram-saved' },
  },
  {
    id: 'ai-panel',
    target: () => '[data-tour="ai-panel"]',
    title: { es: 'Trazo, el mentor del equipo', en: 'Trazo, the team mentor' },
    body: {
      es: 'Pregúntale dudas de UML o pide cambios con tus palabras, por ejemplo: <em>«Agrega la clase Prestamo con fechaInicio Date y relaciónala con Libro»</em>. Todo el equipo ve la conversación en tiempo real y Trazo responde a cada persona por su nombre. También puede digitalizar un boceto desde una foto.',
      en: 'Ask UML questions or request changes in your own words, for example: <em>«Add a Loan class with startDate Date and relate it to Book»</em>. The whole team sees the conversation in real time and Trazo answers each person by name. It can also digitize a sketch from a photo.',
    },
    advance: { type: 'next' },
  },
  {
    id: 'generate',
    target: () => '[data-tour="generate"]',
    title: { es: 'Genera el código', en: 'Generate the code' },
    body: {
      es: 'A partir del diagrama se genera un backend <strong>Spring Boot</strong> y una app móvil <strong>Flutter</strong> listos para ejecutar.',
      en: 'From the diagram you get a <strong>Spring Boot</strong> backend and a <strong>Flutter</strong> mobile app ready to run.',
    },
    hint: { es: 'Haz clic en «Generar Full Stack».', en: 'Click «Generate Full Stack».' },
    advance: { type: 'event', event: 'codegen-opened' },
  },
  {
    id: 'download',
    target: () => '[data-tour="codegen-download"]',
    title: { es: 'Descarga el proyecto', en: 'Download the project' },
    body: {
      es: 'Revisa los archivos generados (entidades <code>Libro</code> y <code>Autor</code>, repositorios, servicios, controladores…) y descárgalos en un <code>.zip</code>.<br><br>¡Listo! Puedes repetirlo cuando quieras desde <strong>Primeros pasos</strong> en Inicio.',
      en: 'Review the generated files (<code>Book</code> and <code>Author</code> entities, repositories, services, controllers…) and download them as a <code>.zip</code>.<br><br>Done! You can replay it anytime from <strong>Getting started</strong> on Home.',
    },
    advance: { type: 'next' },
  },
];
