import type { AppRole } from '@/contexts/AuthContext';
import type { Project } from '@/data/projects';

/** Plan: Researcher + Admin + users for projects they created or saved from Research. */
export function canEditProject(
  userId: string | undefined,
  roles: AppRole[],
  project: Pick<Project, 'createdByUserId' | 'researchSavedByUserId'>,
): boolean {
  if (!userId) return false;
  if (roles.includes('admin') || roles.includes('researcher')) return true;
  return project.createdByUserId === userId || project.researchSavedByUserId === userId;
}

/** Plan: Admin (all) | Researcher (only created_by self) | User (only research_saved_by self). */
export function canDeleteProject(
  userId: string | undefined,
  roles: AppRole[],
  project: Pick<Project, 'createdByUserId' | 'researchSavedByUserId'>,
): boolean {
  if (!userId) return false;
  if (roles.includes('admin')) return true;
  if (roles.includes('researcher')) return project.createdByUserId === userId;
  return project.researchSavedByUserId === userId;
}
