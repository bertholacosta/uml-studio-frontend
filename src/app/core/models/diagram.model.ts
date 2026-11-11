export type UmlRelationshipType =
  | 'association'
  | 'generalization'
  | 'realization'
  | 'composition'
  | 'aggregation'
  | 'dependency'
  | 'association_class';

/** Visibilidad UML: + público, − privado, # protegido, ~ de paquete. */
export type UmlVisibility = 'public' | 'private' | 'protected' | 'package';

/** Hacia qué extremo se puede navegar una asociación (punta de flecha abierta). */
export type UmlNavigability = 'unspecified' | 'to_target' | 'to_source' | 'both';

export interface UmlAttribute {
  name: string;
  type: string;
  /** Si falta, privado. */
  visibility?: UmlVisibility;
  orderIndex?: number;
}

export interface UmlMethod {
  name: string;
  parameters: string;
  returnType: string;
  /** Si falta, público. */
  visibility?: UmlVisibility;
  orderIndex?: number;
}

export interface UmlClassNode {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  height?: number;
  attributes: UmlAttribute[];
  methods: UmlMethod[];
  isAnchor?: boolean;
  assocMainConnId?: string;
}

export interface UmlConnection {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceId: string;
  targetId: string;
  from?: string;
  to?: string;
  type: UmlRelationshipType;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  /** Nombre de rol de cada extremo. */
  sourceRole?: string;
  targetRole?: string;
  navigability?: UmlNavigability;
  assocAnchorNodeId?: string;
}

export interface DiagramDto {
  id: string;
  projectId: string | null;
  name: string;
  version: string;
  nodes: {
    id: string;
    name: string;
    positionX: number;
    positionY: number;
    width?: number;
    height?: number | null;
    isAnchor?: boolean;
    assocMainConnId?: string | null;
    attributes?: UmlAttribute[];
    methods?: UmlMethod[];
  }[];
  connections: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceId: string;
    targetId: string;
    type: string;
    name?: string | null;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
    sourceRole?: string | null;
    targetRole?: string | null;
    navigability?: string;
    assocAnchorNodeId?: string | null;
  }[];
  updatedAt: string;
  createdAt: string;
}

export interface SaveDiagramAstRequest {
  nodes: {
    id: string;
    name: string;
    positionX: number;
    positionY: number;
    width?: number;
    height?: number | null;
    isAnchor?: boolean;
    assocMainConnId?: string | null;
    attributes?: UmlAttribute[];
    methods?: UmlMethod[];
  }[];
  connections: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceId: string;
    targetId: string;
    type: string;
    name?: string | null;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
    sourceRole?: string | null;
    targetRole?: string | null;
    navigability?: string;
    assocAnchorNodeId?: string | null;
  }[];
}
