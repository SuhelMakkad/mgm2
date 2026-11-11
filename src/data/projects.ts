import { getCollection, type CollectionEntry } from 'astro:content';

export type ProjectStatus = CollectionEntry<'projects'>['data']['status'];

export const statusLabels: Record<ProjectStatus, string> = {
  ongoing: 'Ongoing',
  completed: 'Completed',
  upcoming: 'To be commenced',
};

export const statusOrder: ProjectStatus[] = ['ongoing', 'completed', 'upcoming'];

/** All projects in display order. Collection order is not guaranteed, so sort explicitly. */
export async function getProjects() {
  const projects = await getCollection('projects');

  return projects.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function getTeam() {
  const team = await getCollection('team');

  return team.sort((a, b) => a.data.order - b.data.order);
}
