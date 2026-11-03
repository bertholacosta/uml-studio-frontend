import { describe, it, expect } from 'vitest';
import { withFreshIds } from './fresh-ids';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';

const node = (id: string, name: string, extra: Partial<UmlClassNode> = {}): UmlClassNode => ({
  id,
  name,
  position: { x: 0, y: 0 },
  width: 220,
  attributes: [],
  methods: [],
  ...extra,
});

describe('withFreshIds', () => {
  it('renueva los ids y mantiene coherentes las referencias', () => {
    const nodes = [
      node('A', 'Alumno'),
      node('C', 'Curso'),
      node('X', '', { isAnchor: true }),
      node('AC', 'AlumnoCurso', { assocMainConnId: 'r' }),
    ];
    const connections: UmlConnection[] = [
      {
        id: 'r',
        sourceNodeId: 'A',
        targetNodeId: 'C',
        sourceId: 'A_right',
        targetId: 'C_left',
        type: 'association',
        assocAnchorNodeId: 'X',
      },
      {
        id: 'l',
        sourceNodeId: 'X',
        targetNodeId: 'AC',
        sourceId: 'X',
        targetId: 'AC_top',
        type: 'association_class' as any,
      },
    ];

    const res = withFreshIds(nodes, connections);
    const id = (name: string) => res.nodes.find((n) => n.name === name)!.id;
    const [main, link] = res.connections;

    expect(res.nodes.map((n) => n.id)).not.toContain('A');
    expect(id('')).toMatch(/^anchor_/);
    expect(main).toMatchObject({
      sourceNodeId: id('Alumno'),
      sourceId: `${id('Alumno')}_right`,
      targetId: `${id('Curso')}_left`,
      assocAnchorNodeId: id(''),
    });
    expect(link).toMatchObject({ sourceId: id(''), targetId: `${id('AlumnoCurso')}_top` });
    expect(res.nodes.find((n) => n.name === 'AlumnoCurso')!.assocMainConnId).toBe(main.id);
  });

  it('dos importaciones del mismo archivo producen ids distintos', () => {
    const nodes = [node('A', 'Alumno')];
    expect(withFreshIds(nodes, []).nodes[0].id).not.toBe(withFreshIds(nodes, []).nodes[0].id);
  });
});
