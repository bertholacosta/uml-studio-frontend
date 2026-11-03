/** Acciones reales de la app que hacen avanzar (o retroceder) el recorrido guiado. */
export type TourEvent =
  | 'projects-opened'
  | 'create-modal-opened'
  | 'create-modal-closed'
  | 'project-created'
  | 'editor-ready'
  | 'class-added'
  | 'node-modal-opened'
  | 'node-modal-closed'
  | 'node-saved'
  | 'relation-selected'
  | 'relation-cleared'
  | 'connection-created'
  | 'diagram-saved'
  | 'codegen-opened';

export interface TourEventPayload {
  projectId?: string;
  nodeId?: string;
}

/** Datos que el recorrido va recordando para resaltar lo que el usuario acaba de crear. */
export interface TourContext {
  projectId?: string;
  nodeIds: string[];
}

export interface LocalizedText {
  es: string;
  en: string;
}

/**
 * Cómo se pasa al siguiente paso:
 * - next: paso informativo, botón «Siguiente».
 * - input: el elemento resaltado es un campo; «Siguiente» se habilita cuando tiene texto.
 * - event: avanza solo cuando el usuario realiza la acción indicada.
 */
export type TourAdvance =
  { type: 'next' } | { type: 'input' } | { type: 'event'; event: TourEvent };

export interface TourStep {
  id: string;
  /** Selector CSS del elemento a resaltar; sin selector la tarjeta se centra. */
  target?: (ctx: TourContext) => string | null;
  title: LocalizedText;
  /** Admite HTML simple (strong, em, code). */
  body: LocalizedText;
  /** Pista de la acción esperada en pasos de tipo input/event. */
  hint?: LocalizedText;
  advance: TourAdvance;
  /** Si ocurre este evento (p. ej. se cancela un modal) se vuelve al paso indicado. */
  revert?: { event: TourEvent; toStep: string };
}

export type TourStatus = 'completed' | 'skipped';

/** Dónde quedó el recorrido al omitirlo, para poder continuarlo. */
export interface TourCheckpoint {
  stepId: string;
  projectId?: string;
}

/** Tarea visible en «Primeros pasos»; se marca al superar el paso indicado del recorrido. */
export interface TourTask {
  id: string;
  completesAfterStep: string;
  title: LocalizedText;
  description: LocalizedText;
}
