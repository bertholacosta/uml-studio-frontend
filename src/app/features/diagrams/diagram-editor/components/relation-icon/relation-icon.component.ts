import { Component, input } from '@angular/core';
import { UmlRelationshipType } from '../../../../../core/models/diagram.model';

/** Miniatura del trazo UML de cada tipo de relación (paleta y panel de relación). */
@Component({
  selector: 'app-relation-icon',
  standalone: true,
  template: `
    <svg width="34" height="14" viewBox="0 0 34 14" class="block shrink-0" aria-hidden="true">
      @switch (type()) {
        @case ('generalization') {
          <line x1="1" y1="7" x2="24" y2="7" class="uml-icon-line" />
          <polygon points="24,2 33,7 24,12" class="uml-icon-hollow" />
        }
        @case ('realization') {
          <line x1="1" y1="7" x2="24" y2="7" class="uml-icon-line" stroke-dasharray="3 2" />
          <polygon points="24,2 33,7 24,12" class="uml-icon-hollow" />
        }
        @case ('aggregation') {
          <polygon points="1,7 7,3 13,7 7,11" class="uml-icon-hollow" />
          <line x1="13" y1="7" x2="33" y2="7" class="uml-icon-line" />
        }
        @case ('composition') {
          <polygon points="1,7 7,3 13,7 7,11" class="uml-icon-filled" />
          <line x1="13" y1="7" x2="33" y2="7" class="uml-icon-line" />
        }
        @case ('dependency') {
          <line x1="1" y1="7" x2="32" y2="7" class="uml-icon-line" stroke-dasharray="3 2" />
          <polyline points="26,3 32,7 26,11" class="uml-icon-open" />
        }
        @case ('association_class') {
          <line x1="1" y1="3" x2="33" y2="3" class="uml-icon-line" />
          <line x1="17" y1="3" x2="17" y2="8" class="uml-icon-line" stroke-dasharray="2 1.5" />
          <rect x="11" y="8" width="12" height="5" class="uml-icon-hollow" />
        }
        @default {
          <line x1="1" y1="7" x2="33" y2="7" class="uml-icon-line" />
        }
      }
    </svg>
  `,
})
export class RelationIconComponent {
  readonly type = input<UmlRelationshipType>('association');
}
