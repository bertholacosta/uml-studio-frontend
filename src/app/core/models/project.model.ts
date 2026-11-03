export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface ProjectMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  basePackage: string;
  javaVersion: number;
  springBootVersion: string;
  createdBy: string;
  creatorName: string;
  userRole?: ProjectRole;
  memberCount: number;
  diagramCount: number;
  createdAt: string;
  members?: ProjectMember[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  basePackage?: string;
  javaVersion?: number;
  springBootVersion?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  basePackage?: string;
  javaVersion?: number;
  springBootVersion?: string;
}

export interface AddMemberRequest {
  email: string;
  role?: ProjectRole;
}

export interface UpdateMemberRoleRequest {
  role: ProjectRole;
}
