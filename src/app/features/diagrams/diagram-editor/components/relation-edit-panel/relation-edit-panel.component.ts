import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroXMark,
  heroTrash,
  heroArrowsRightLeft,
  heroSquare2Stack,
  heroInformationCircle,
} from '@ng-icons/heroicons/outline';
import {
  UmlConnection,
  UmlNavigability,
  UmlRelationshipType,
} from '../../../../../core/models/diagram.model';
import {
  NAVIGABILITY_OPTIONS,
  allowsSelfRelation,
  hasAssociationEnds,
} from '../../../../../core/utils/uml-notation';
import { TranslatePipe } from '../../../../../core/i18n';
import { RelationIconComponent } from '../relation-icon/relation-icon.component';

interface RelationOption {
  id: Exclude<UmlRelationshipType, 'association_class'>;
  labelKey: string;
}

/**
 * Panel flotante de edición de una relación: tipo, sentido, multiplicidades
 * y clase de asociación. Los cambios se aplican en vivo.
 */
@Component({
  selector: 'app-relation-edit-panel',
  standalone: true,
  imports: [CommonModule, NgIconComponent, TranslatePipe, RelationIconComponent],
  providers: [
    provideIcons({
      heroXMark,
      heroTrash,
      heroArrowsRightLeft,
      heroSquare2Stack,
      heroInformationCircle,
    }),
  ],
  templateUrl: './relation-edit-panel.component.html',
})
export class RelationEditPanelComponent {
  readonly connection = input.required<UmlConnection>();
  readonly sourceName = input<string>('');
  readonly targetName = input<string>('');
  readonly left = input<number>(0);
  readonly top = input<number>(0);

  readonly connectionChange = output<UmlConnection>();
  readonly swap = output<void>();
  readonly toggleAssociationClass = output<void>();
  readonly deleted = output<void>();
  readonly closed = output<void>();

  readonly relationOptions: RelationOption[] = [
    { id: 'association', labelKey: 'toolbar.relationships.association' },
    { id: 'generalization', labelKey: 'toolbar.relationships.generalization' },
    { id: 'realization', labelKey: 'toolbar.relationships.realization' },
    { id: 'aggregation', labelKey: 'toolbar.relationships.aggregation' },
    { id: 'composition', labelKey: 'toolbar.relationships.composition' },
    { id: 'dependency', labelKey: 'toolbar.relationships.dependency' },
  ];

  readonly quickMultiplicities = ['1', '0..1', '*', '1..*'];
  readonly navigabilityOptions = NAVIGABILITY_OPTIONS;

  /** La relación une una clase consigo misma. */
  isSelf(): boolean {
    const c = this.connection();
    return !!c.sourceNodeId && c.sourceNodeId === c.targetNodeId;
  }

  /** Rol y navegabilidad solo existen en los extremos de una asociación. */
  hasEnds(): boolean {
    return hasAssociationEnds(this.connection().type);
  }

  isTypeDisabled(type: UmlRelationshipType): boolean {
    if (this.hasAssociationClass() && type !== 'association') return true;
    return this.isSelf() && !allowsSelfRelation(type);
  }

  navigabilityHint(): string {
    const nav = this.connection().navigability || 'unspecified';
    return NAVIGABILITY_OPTIONS.find((o) => o.id === nav)!.labelKey;
  }

  hasAssociationClass(): boolean {
    return !!this.connection().assocAnchorNodeId;
  }

  private emit(patch: Partial<UmlConnection>): void {
    this.connectionChange.emit({ ...this.connection(), ...patch });
  }

  setType(type: UmlRelationshipType): void {
    if (this.isTypeDisabled(type)) return;
    this.emit({ type });
  }

  setName(name: string): void {
    this.emit({ name: name || undefined });
  }

  setRole(end: 'source' | 'target', value: string): void {
    const role = value || undefined;
    this.emit(end === 'source' ? { sourceRole: role } : { targetRole: role });
  }

  setNavigability(navigability: UmlNavigability): void {
    this.emit({ navigability });
  }

  setMultiplicity(end: 'source' | 'target', value: string): void {
    this.emit(end === 'source' ? { sourceMultiplicity: value } : { targetMultiplicity: value });
  }
}
