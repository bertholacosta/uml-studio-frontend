import { UmlClassNode, UmlConnection } from '../../../core/models/diagram.model';

export type ChangeKind = 'added' | 'removed' | 'changed';

/**
 * Lo que cambia una propuesta de Trazo, para pintarlo en el lienzo: el diagrama propuesto más
 * lo que desaparece (como «fantasma»), con qué es nuevo, qué se quita y qué cambia.
 */
export interface ProposalDiff {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  nodeKinds: Map<string, ChangeKind>;
  /** Clave `${nodeId}:attr:${nombre}` o `${nodeId}:method:${nombre}`. */
  memberKinds: Map<string, ChangeKind>;
  connectionKinds: Map<string, ChangeKind>;
  counts: Record<ChangeKind, number>;
}

const SIDE_SUFFIX = /(?:_(?:top|bottom|left|right)|__box)$/;
const lower = (text: string | undefined) => (text || '').trim().toLowerCase();
const endpoint = (nodeId: string | undefined, connectorId: string | undefined) =>
  nodeId || (connectorId || '').replace(SIDE_SUFFIX, '');

export const memberKey = (nodeId: string, kind: 'attr' | 'method', name: string) =>
  `${nodeId}:${kind}:${lower(name)}`;

type Member = { name: string; type?: string; parameters?: string; returnType?: string };

/** Compara atributos o métodos por nombre; los que se quitan se añaden al final para verlos. */
function diffMembers<T extends Member>(
  nodeId: string,
  kind: 'attr' | 'method',
  before: T[],
  after: T[],
  marks: Map<string, ChangeKind>,
): T[] {
  const old = new Map(before.map((m) => [lower(m.name), m]));
  const kept = new Set<string>();
  for (const member of after) {
    const previous = old.get(lower(member.name));
    if (!previous) {
      marks.set(memberKey(nodeId, kind, member.name), 'added');
      continue;
    }
    kept.add(lower(member.name));
    const differs =
      kind === 'attr'
        ? previous.type !== member.type
        : (previous.parameters || '') !== (member.parameters || '') ||
          (previous.returnType || 'void') !== (member.returnType || 'void');
    if (differs) marks.set(memberKey(nodeId, kind, member.name), 'changed');
  }
  const removed = before.filter((m) => !kept.has(lower(m.name)));
  for (const member of removed) marks.set(memberKey(nodeId, kind, member.name), 'removed');
  return [...after, ...removed];
}

export function diffProposal(
  base: { nodes: UmlClassNode[]; connections: UmlConnection[] },
  proposed: { nodes: UmlClassNode[]; connections: UmlConnection[] },
): ProposalDiff {
  const nodeKinds = new Map<string, ChangeKind>();
  const memberKinds = new Map<string, ChangeKind>();
  const connectionKinds = new Map<string, ChangeKind>();

  // Las clases se emparejan por id y, si no, por nombre
  const byId = new Map(base.nodes.map((n) => [n.id, n]));
  const byName = new Map(base.nodes.filter((n) => !n.isAnchor).map((n) => [lower(n.name), n]));
  const matched = new Set<string>();
  /** Id de la clase base → id en la propuesta (por si cambió). */
  const sameAs = new Map<string, string>();

  const nodes = proposed.nodes.map((node) => {
    const previous =
      byId.get(node.id) || (node.isAnchor ? undefined : byName.get(lower(node.name)));
    if (!previous) {
      if (!node.isAnchor) nodeKinds.set(node.id, 'added');
      return node;
    }
    matched.add(previous.id);
    sameAs.set(previous.id, node.id);
    if (node.isAnchor) return node;
    const attributes = diffMembers(
      node.id,
      'attr',
      previous.attributes,
      node.attributes,
      memberKinds,
    );
    const methods = diffMembers(node.id, 'method', previous.methods, node.methods, memberKinds);
    const membersChanged = [...memberKinds.keys()].some((k) => k.startsWith(`${node.id}:`));
    if (previous.name !== node.name || membersChanged) nodeKinds.set(node.id, 'changed');
    return { ...node, attributes, methods };
  });
  const ghosts = base.nodes.filter((n) => !matched.has(n.id));
  for (const ghost of ghosts) if (!ghost.isAnchor) nodeKinds.set(ghost.id, 'removed');

  // Las relaciones, por id o por sus extremos (en cualquier sentido)
  const ends = (c: UmlConnection, map = (id: string) => id) =>
    [map(endpoint(c.sourceNodeId, c.sourceId)), map(endpoint(c.targetNodeId, c.targetId))] as const;
  const keyOf = (a: string, b: string) => [a, b].sort().join('|');
  const baseConns = new Map(base.connections.map((c) => [c.id, c]));
  const baseByEnds = new Map(
    base.connections.map((c) => [keyOf(...ends(c, (id) => sameAs.get(id) || id)), c]),
  );
  const usedConns = new Set<string>();
  for (const conn of proposed.connections) {
    const previous = baseConns.get(conn.id) || baseByEnds.get(keyOf(...ends(conn)));
    if (!previous || usedConns.has(previous.id)) {
      connectionKinds.set(conn.id, 'added');
      continue;
    }
    usedConns.add(previous.id);
    const differs =
      previous.type !== conn.type ||
      (previous.sourceMultiplicity || '') !== (conn.sourceMultiplicity || '') ||
      (previous.targetMultiplicity || '') !== (conn.targetMultiplicity || '') ||
      lower(previous.name) !== lower(conn.name);
    if (differs) connectionKinds.set(conn.id, 'changed');
  }
  const removedConns = base.connections.filter((c) => !usedConns.has(c.id));
  for (const conn of removedConns) connectionKinds.set(conn.id, 'removed');

  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0 };
  for (const kind of nodeKinds.values()) counts[kind]++;
  for (const kind of connectionKinds.values()) counts[kind]++;

  return {
    nodes: [...nodes, ...ghosts],
    connections: [...proposed.connections, ...removedConns],
    nodeKinds,
    memberKinds,
    connectionKinds,
    counts,
  };
}
