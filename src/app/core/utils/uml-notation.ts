import {
  UmlConnection,
  UmlNavigability,
  UmlRelationshipType,
  UmlVisibility,
} from '../models/diagram.model';

/** Visibilidades UML con el símbolo que se dibuja delante de cada atributo o método. */
export const VISIBILITY_OPTIONS: { id: UmlVisibility; symbol: string; labelKey: string }[] = [
  { id: 'public', symbol: '+', labelKey: 'editor.memberVisibility.public' },
  { id: 'private', symbol: '−', labelKey: 'editor.memberVisibility.private' },
  { id: 'protected', symbol: '#', labelKey: 'editor.memberVisibility.protected' },
  { id: 'package', symbol: '~', labelKey: 'editor.memberVisibility.package' },
];

/** En UML un atributo sin indicar suele ser privado y una operación, pública. */
export const DEFAULT_ATTRIBUTE_VISIBILITY: UmlVisibility = 'private';
export const DEFAULT_METHOD_VISIBILITY: UmlVisibility = 'public';

const SYMBOLS = new Map(VISIBILITY_OPTIONS.map((o) => [o.id, o.symbol]));

export function normalizeVisibility(raw: unknown, fallback: UmlVisibility): UmlVisibility {
  return typeof raw === 'string' && SYMBOLS.has(raw as UmlVisibility)
    ? (raw as UmlVisibility)
    : fallback;
}

export function visibilitySymbol(raw: unknown, fallback: UmlVisibility): string {
  return SYMBOLS.get(normalizeVisibility(raw, fallback))!;
}

export const NAVIGABILITY_OPTIONS: { id: UmlNavigability; labelKey: string }[] = [
  { id: 'unspecified', labelKey: 'editor.navigability.unspecified' },
  { id: 'to_target', labelKey: 'editor.navigability.toTarget' },
  { id: 'to_source', labelKey: 'editor.navigability.toSource' },
  { id: 'both', labelKey: 'editor.navigability.both' },
];

export function normalizeNavigability(raw: unknown): UmlNavigability {
  return NAVIGABILITY_OPTIONS.some((o) => o.id === raw) ? (raw as UmlNavigability) : 'unspecified';
}

/** La navegabilidad vista desde el otro extremo (al invertir el sentido de la relación). */
export function reverseNavigability(value: UmlNavigability | undefined): UmlNavigability {
  if (value === 'to_target') return 'to_source';
  if (value === 'to_source') return 'to_target';
  return value || 'unspecified';
}

/** Solo las asociaciones (y sus variantes con rombo) tienen extremos con rol y navegabilidad. */
const WITH_ENDS: UmlRelationshipType[] = ['association', 'aggregation', 'composition'];

export function hasAssociationEnds(type: UmlRelationshipType | string): boolean {
  return WITH_ENDS.includes(type as UmlRelationshipType);
}

/** Relaciones que una clase puede tener consigo misma (no hereda ni se realiza a sí misma). */
const SELF_ALLOWED: UmlRelationshipType[] = [
  'association',
  'aggregation',
  'composition',
  'dependency',
];

export function allowsSelfRelation(type: UmlRelationshipType | string): boolean {
  return SELF_ALLOWED.includes(type as UmlRelationshipType);
}

/**
 * ¿Lleva punta de flecha abierta ese extremo? Solo en asociaciones navegables hacia él; el
 * extremo que ya tiene el rombo de la agregación o composición no la dibuja.
 */
export function hasNavigationArrow(
  conn: Pick<UmlConnection, 'type' | 'navigability'>,
  end: 'source' | 'target',
  diamondAtSource: boolean,
): boolean {
  if (!hasAssociationEnds(conn.type)) return false;
  const nav = conn.navigability || 'unspecified';
  const pointsHere = nav === 'both' || nav === (end === 'source' ? 'to_source' : 'to_target');
  if (!pointsHere) return false;
  if (conn.type === 'association') return true;
  return end === 'source' ? !diamondAtSource : diamondAtSource;
}
