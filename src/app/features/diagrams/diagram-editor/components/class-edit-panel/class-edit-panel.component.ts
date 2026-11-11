import { Component, ElementRef, AfterViewInit, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroXMark,
  heroPlus,
  heroTrash,
  heroBars2,
  heroInformationCircle,
} from '@ng-icons/heroicons/outline';
import { UmlAttribute, UmlClassNode, UmlMethod } from '../../../../../core/models/diagram.model';
import { TranslatePipe } from '../../../../../core/i18n';
import { VISIBILITY_OPTIONS } from '../../../../../core/utils/uml-notation';

type ListKind = 'attributes' | 'methods';

/**
 * Panel flotante de edición de una clase (estilo Apollon): los cambios se aplican en vivo,
 * Enter crea una fila nueva y las filas se reordenan arrastrando desde el asa.
 */
@Component({
  selector: 'app-class-edit-panel',
  standalone: true,
  imports: [CommonModule, NgIconComponent, TranslatePipe],
  providers: [provideIcons({ heroXMark, heroPlus, heroTrash, heroBars2, heroInformationCircle })],
  templateUrl: './class-edit-panel.component.html',
})
export class ClassEditPanelComponent implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly node = input.required<UmlClassNode>();
  readonly left = input<number>(0);
  readonly top = input<number>(0);
  readonly predefinedTypes = input<string[]>([]);
  readonly predefinedReturnTypes = input<string[]>([]);

  readonly visibilityOptions = VISIBILITY_OPTIONS;

  readonly nodeChange = output<UmlClassNode>();
  readonly closed = output<void>();
  readonly deleted = output<void>();

  // Reordenamiento por arrastre (solo se activa desde el asa)
  readonly dragKind = signal<ListKind | null>(null);
  readonly dragIndex = signal<number | null>(null);
  readonly dropIndex = signal<number | null>(null);

  ngAfterViewInit(): void {
    const input = this.host.nativeElement.querySelector(
      '#class-panel-name',
    ) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  private emit(patch: Partial<UmlClassNode>): void {
    this.nodeChange.emit({ ...this.node(), ...patch });
  }

  onNameChange(value: string): void {
    this.emit({ name: value });
  }

  // ---------------------------------------------------------------- Atributos

  updateAttribute(index: number, patch: Partial<UmlAttribute>): void {
    const attributes = this.node().attributes.map((a, i) => (i === index ? { ...a, ...patch } : a));
    this.emit({ attributes });
  }

  addAttribute(afterIndex?: number): void {
    const attributes = [...this.node().attributes];
    const at = afterIndex === undefined ? attributes.length : afterIndex + 1;
    attributes.splice(at, 0, { name: '', type: 'String', visibility: 'private' });
    this.emit({ attributes });
    this.focusRow('attr', at);
  }

  removeAttribute(index: number): void {
    this.emit({ attributes: this.node().attributes.filter((_, i) => i !== index) });
  }

  // ---------------------------------------------------------------- Métodos

  updateMethod(index: number, patch: Partial<UmlMethod>): void {
    const methods = this.node().methods.map((m, i) => (i === index ? { ...m, ...patch } : m));
    this.emit({ methods });
  }

  addMethod(afterIndex?: number): void {
    const methods = [...this.node().methods];
    const at = afterIndex === undefined ? methods.length : afterIndex + 1;
    methods.splice(at, 0, { name: '', parameters: '', returnType: 'void', visibility: 'public' });
    this.emit({ methods });
    this.focusRow('method', at);
  }

  removeMethod(index: number): void {
    this.emit({ methods: this.node().methods.filter((_, i) => i !== index) });
  }

  onRowEnter(kind: ListKind, index: number, event: Event): void {
    event.preventDefault();
    if (kind === 'attributes') this.addAttribute(index);
    else this.addMethod(index);
  }

  private focusRow(prefix: 'attr' | 'method', index: number): void {
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector(
        `#${prefix}-name-${index}`,
      ) as HTMLInputElement | null;
      el?.focus();
    });
  }

  // ---------------------------------------------------------------- Reordenar

  armDrag(kind: ListKind, index: number): void {
    this.dragKind.set(kind);
    this.dragIndex.set(index);
  }

  isDraggable(kind: ListKind, index: number): boolean {
    return this.dragKind() === kind && this.dragIndex() === index;
  }

  onDragStart(event: DragEvent): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', '');
    }
  }

  onDragOver(kind: ListKind, index: number, event: DragEvent): void {
    if (this.dragKind() !== kind) return;
    event.preventDefault();
    this.dropIndex.set(index);
  }

  onDrop(kind: ListKind, index: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragIndex();
    if (this.dragKind() === kind && from !== null && from !== index) {
      const list = [
        ...(kind === 'attributes' ? this.node().attributes : this.node().methods),
      ] as any[];
      const [moved] = list.splice(from, 1);
      list.splice(index, 0, moved);
      this.emit(kind === 'attributes' ? { attributes: list } : { methods: list });
    }
    this.endDrag();
  }

  endDrag(): void {
    this.dragKind.set(null);
    this.dragIndex.set(null);
    this.dropIndex.set(null);
  }
}
