import { getDb, generateId } from '../db/database';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export function createOrganization(name: string): Organization {
  const id = generateId('org');
  getDb()
    .prepare('INSERT INTO organizations (id, name) VALUES (?, ?)')
    .run(id, name);
  return findOrganizationById(id)!;
}

export function findOrganizationById(id: string): Organization | undefined {
  return getDb().prepare('SELECT * FROM organizations WHERE id = ?').get(id) as Organization | undefined;
}
