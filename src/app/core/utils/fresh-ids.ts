import { UmlClassNode, UmlConnection } from '../models/diagram.model';

const suffix = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/**
 * Asigna ids nuevos a nodos y conexiones y actualiza todas sus referencias
 * (extremos, puntos de conexión «<nodo>_right», anclas y tablas intermedias).
 * En la base los ids son únicos entre todos los diagramas, así que un diagrama
 * importado no puede reutilizar los del archivo.
 */
export function withFreshIds(
  nodes: UmlClassNode[],
  connections: UmlConnection[],
): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
  const nodeIds = new Map(
    nodes.map((n) => [n.id, `${n.isAnchor ? 'anchor' : 'node'}_${suffix()}`]),
  );
  const connIds = new Map(connections.map((c) => [c.id, `conn_${suffix()}`]));

  const node = (id?: string) => (id && nodeIds.get(id)) || id;
  const conn = (id?: string) => (id && connIds.get(id)) || id;
  const handle = (id?: string) => {
    if (!id) return id;
    const [, base, side = ''] = id.match(/^(.*?)(_(?:top|bottom|left|right))?$/) || [, id];
    return nodeIds.has(base!) ? `${nodeIds.get(base!)}${side}` : id;
  };

  return {
    nodes: nodes.map((n) => ({ ...n, id: node(n.id)!, assocMainConnId: conn(n.assocMainConnId) })),
    connections: connections.map((c) => ({
      ...c,
      id: conn(c.id)!,
      sourceNodeId: node(c.sourceNodeId),
      targetNodeId: node(c.targetNodeId),
      sourceId: handle(c.sourceId)!,
      targetId: handle(c.targetId)!,
      from: handle(c.from),
      to: handle(c.to),
      assocAnchorNodeId: node(c.assocAnchorNodeId),
    })),
  };
}
