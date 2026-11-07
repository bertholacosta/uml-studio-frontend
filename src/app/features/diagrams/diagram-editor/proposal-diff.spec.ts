import { describe, it, expect } from 'vitest';
import { diffProposal, memberKey } from './proposal-diff';
import { UmlClassNode, UmlConnection } from '../../../core/models/diagram.model';

const node = (
  id: string,
  name: string,
  attributes: [string, string][] = [['id', 'UUID']],
): UmlClassNode => ({
  id,
  name,
  position: { x: 0, y: 0 },
  width: 160,
  attributes: attributes.map(([n, type]) => ({ name: n, type })),
  methods: [],
});

const relation = (id: string, source: string, target: string, extra = {}): UmlConnection => ({
  id,
  sourceId: `${source}_right`,
  targetId: `${target}_left`,
  type: 'association',
  sourceMultiplicity: '*',
  targetMultiplicity: '1',
  ...extra,
});

describe('diffProposal', () => {
  const lote = node('n1', 'Lote', [
    ['id', 'UUID'],
    ['codigoProveedor', 'String'],
    ['precio', 'Double'],
  ]);
  const proveedor = node('n2', 'Proveedor');
  const viejo = node('n3', 'Viejo');
  const base = {
    nodes: [lote, proveedor, viejo],
    connections: [relation('c1', 'n1', 'n2'), relation('c2', 'n3', 'n2')],
  };

  it('marca lo nuevo, lo que se quita y lo que cambia, y conserva lo quitado para verlo', () => {
    const proposed = {
      nodes: [
        node('n1', 'Lote', [
          ['id', 'UUID'],
          ['precio', 'BigDecimal'],
          ['fechaVencimiento', 'LocalDate'],
        ]),
        proveedor,
        node('n9', 'Pago'),
      ],
      connections: [
        relation('c1', 'n1', 'n2'),
        relation('c9', 'n9', 'n1', { targetMultiplicity: '1..*' }),
      ],
    };
    const diff = diffProposal(base, proposed);

    expect(diff.nodes.map((n) => n.name)).toEqual(['Lote', 'Proveedor', 'Pago', 'Viejo']);
    expect(Object.fromEntries(diff.nodeKinds)).toEqual({
      n1: 'changed',
      n9: 'added',
      n3: 'removed',
    });
    expect(diff.memberKinds.get(memberKey('n1', 'attr', 'codigoProveedor'))).toBe('removed');
    expect(diff.memberKinds.get(memberKey('n1', 'attr', 'precio'))).toBe('changed');
    expect(diff.memberKinds.get(memberKey('n1', 'attr', 'fechaVencimiento'))).toBe('added');
    // El atributo quitado se sigue viendo, al final
    expect(diff.nodes[0].attributes.map((a) => a.name)).toEqual([
      'id',
      'precio',
      'fechaVencimiento',
      'codigoProveedor',
    ]);
    expect(Object.fromEntries(diff.connectionKinds)).toEqual({ c9: 'added', c2: 'removed' });
    expect(diff.connections.map((c) => c.id)).toEqual(['c1', 'c9', 'c2']);
    expect(diff.counts).toEqual({ added: 2, removed: 2, changed: 1 });
  });

  it('empareja por nombre y por extremos aunque cambien los ids', () => {
    const proposed = {
      nodes: [
        node(
          'x1',
          'Lote',
          lote.attributes.map((a) => [a.name, a.type]),
        ),
        proveedor,
        viejo,
      ],
      connections: [relation('otra', 'n2', 'x1'), relation('c2', 'n3', 'n2')],
    };
    const diff = diffProposal(base, proposed);
    expect(diff.nodeKinds.size).toBe(0);
    expect(diff.connectionKinds.size).toBe(0);
  });

  it('señala un cambio de multiplicidad en una relación', () => {
    const proposed = {
      nodes: base.nodes,
      connections: [relation('c1', 'n1', 'n2', { type: 'composition' }), base.connections[1]],
    };
    expect(Object.fromEntries(diffProposal(base, proposed).connectionKinds)).toEqual({
      c1: 'changed',
    });
  });
});
