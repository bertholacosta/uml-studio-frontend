import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FFlowModule } from '@foblex/flow';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroSparkles,
  heroCursorArrowRays,
  heroArrowUturnLeft,
  heroArrowUturnRight,
} from '@ng-icons/heroicons/outline';
import { UmlRelationshipType } from '../../../../../core/models/diagram.model';
import { TranslatePipe } from '../../../../../core/i18n';
import { RelationIconComponent } from '../relation-icon/relation-icon.component';

/**
 * Barra vertical de herramientas (estilo Miro): asistente, seleccionar, clase (clic o arrastrar),
 * relación (menú con los tipos) y deshacer / rehacer.
 */
@Component({
  selector: 'app-diagram-toolbox',
  standalone: true,
  imports: [CommonModule, FFlowModule, NgIconComponent, TranslatePipe, RelationIconComponent],
  providers: [
    provideIcons({
      heroSparkles,
      heroCursorArrowRays,
      heroArrowUturnLeft,
      heroArrowUturnRight,
    }),
  ],
  templateUrl: './diagram-toolbox.component.html',
})
export class DiagramToolboxComponent {
  // Inputs
  readonly isReadOnly = input<boolean>(false);
  readonly relationTool = input<UmlRelationshipType | null>(null);
  readonly isAssistantOpen = input<boolean>(true);
  readonly canUndo = input<boolean>(false);
  readonly canRedo = input<boolean>(false);

  // Eventos de salida hacia DiagramEditorComponent
  readonly addClass = output<void>();
  readonly relationToolChange = output<UmlRelationshipType | null>();
  readonly toggleAssistant = output<void>();
  readonly undo = output<void>();
  readonly redo = output<void>();

  readonly isRelationMenuOpen = signal(false);

  // Herramientas de relación (como en StarUML): se elige una y se hace clic en origen y destino
  readonly relationTools: { id: UmlRelationshipType; labelKey: string }[] = [
    { id: 'association', labelKey: 'toolbar.relationships.association' },
    { id: 'generalization', labelKey: 'toolbar.relationships.generalization' },
    { id: 'realization', labelKey: 'toolbar.relationships.realization' },
    { id: 'aggregation', labelKey: 'toolbar.relationships.aggregation' },
    { id: 'composition', labelKey: 'toolbar.relationships.composition' },
    { id: 'dependency', labelKey: 'toolbar.relationships.dependency' },
    { id: 'association_class', labelKey: 'toolbar.relationships.associationClass' },
  ];
}
