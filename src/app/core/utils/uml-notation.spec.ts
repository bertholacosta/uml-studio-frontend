import {
  allowsSelfRelation,
  hasNavigationArrow,
  normalizeNavigability,
  reverseNavigability,
  visibilitySymbol,
} from './uml-notation';

describe('uml-notation', () => {
  it('dibuja el símbolo de cada visibilidad y usa la habitual si falta o no es válida', () => {
    expect(visibilitySymbol('public', 'private')).toBe('+');
    expect(visibilitySymbol('protected', 'private')).toBe('#');
    expect(visibilitySymbol('package', 'private')).toBe('~');
    expect(visibilitySymbol(undefined, 'private')).toBe('−');
    expect(visibilitySymbol('secreto', 'public')).toBe('+');
  });

  it('pone la flecha solo en el extremo hacia el que se navega', () => {
    const assoc = { type: 'association', navigability: 'to_target' } as const;
    expect(hasNavigationArrow(assoc, 'target', true)).toBe(true);
    expect(hasNavigationArrow(assoc, 'source', true)).toBe(false);
    expect(hasNavigationArrow({ ...assoc, navigability: 'both' }, 'source', true)).toBe(true);
    expect(hasNavigationArrow({ type: 'association' }, 'target', true)).toBe(false);
  });

  it('no dibuja flecha en herencia o dependencia ni sobre el rombo de una composición', () => {
    expect(
      hasNavigationArrow({ type: 'generalization', navigability: 'both' }, 'target', true),
    ).toBe(false);
    const whole = { type: 'composition', navigability: 'both' } as const;
    // Rombo en el origen: solo cabe la flecha del destino
    expect(hasNavigationArrow(whole, 'source', true)).toBe(false);
    expect(hasNavigationArrow(whole, 'target', true)).toBe(true);
    // Rombo en el destino
    expect(hasNavigationArrow(whole, 'source', false)).toBe(true);
    expect(hasNavigationArrow(whole, 'target', false)).toBe(false);
  });

  it('invierte la navegabilidad al cambiar el sentido de la relación', () => {
    expect(reverseNavigability('to_target')).toBe('to_source');
    expect(reverseNavigability('to_source')).toBe('to_target');
    expect(reverseNavigability('both')).toBe('both');
    expect(reverseNavigability(undefined)).toBe('unspecified');
    expect(normalizeNavigability('cualquiera')).toBe('unspecified');
  });

  it('permite la autoasociación pero no heredar de uno mismo', () => {
    expect(allowsSelfRelation('association')).toBe(true);
    expect(allowsSelfRelation('composition')).toBe(true);
    expect(allowsSelfRelation('generalization')).toBe(false);
    expect(allowsSelfRelation('realization')).toBe(false);
    expect(allowsSelfRelation('association_class')).toBe(false);
  });
});
