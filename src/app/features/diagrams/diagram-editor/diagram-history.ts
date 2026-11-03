import { UmlClassNode, UmlConnection } from '../../../core/models/diagram.model';

export interface DiagramSnapshot {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
}

/**
 * Historial de deshacer / rehacer basado en instantáneas del diagrama.
 * Guarda el último estado confirmado; cada `commit` apila ese estado y toma el nuevo como base.
 */
export class DiagramHistory {
  private readonly limit = 80;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private baseline: string | null = null;

  /** Reinicia la base sin crear un paso (carga inicial, sincronización remota). */
  reset(snapshot: DiagramSnapshot, clearStacks = false): void {
    this.baseline = JSON.stringify(snapshot);
    if (clearStacks) {
      this.undoStack = [];
      this.redoStack = [];
    }
  }

  /** Registra el estado actual como un paso deshacible. */
  commit(snapshot: DiagramSnapshot): void {
    const next = JSON.stringify(snapshot);
    if (this.baseline === null) {
      this.baseline = next;
      return;
    }
    if (next === this.baseline) return;
    this.undoStack.push(this.baseline);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.baseline = next;
  }

  undo(): DiagramSnapshot | null {
    const prev = this.undoStack.pop();
    if (!prev || this.baseline === null) return null;
    this.redoStack.push(this.baseline);
    this.baseline = prev;
    return JSON.parse(prev);
  }

  redo(): DiagramSnapshot | null {
    const next = this.redoStack.pop();
    if (!next || this.baseline === null) return null;
    this.undoStack.push(this.baseline);
    this.baseline = next;
    return JSON.parse(next);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
