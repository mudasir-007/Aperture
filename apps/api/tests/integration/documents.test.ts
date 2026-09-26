import request from 'supertest';
import { app, resetDatabase } from '../testUtils';
import { closeDb, getDb } from '../../src/db/database';

async function registerAndLogin(email: string, orgName: string) {
  const res = await request(app).post('/api/auth/register').send({
    email,
    password: 'supersecret1',
    name: 'Test User',
    organizationName: orgName
  });
  return { token: res.body.token as string, user: res.body.user };
}

describe('Documents API', () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    closeDb();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/documents');
    expect(response.status).toBe(401);
  });

  it('uploads a .txt document and ingests it synchronously to "ready"', async () => {
    const { token } = await registerAndLogin('owner@example.com', 'Owner Co');

    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('The office is closed on public holidays.'), {
        filename: 'policy.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(201);
    expect(response.body.document.status).toBe('ready');
    expect(response.body.document.filename).toBe('policy.txt');
  });

  it('marks an unsupported file type as failed with a clear error, not a crash', async () => {
    const { token } = await registerAndLogin('owner2@example.com', 'Owner2 Co');

    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4 fake binary content'), {
        filename: 'file.pdf',
        contentType: 'application/pdf'
      });

    expect(response.status).toBe(201); // upload itself succeeds
    expect(response.body.document.status).toBe('failed');
    expect(response.body.document.errorMessage).toMatch(/unsupported file type/i);
  });

  it('does not let one organization see another organization\'s documents', async () => {
    const orgA = await registerAndLogin('a@example.com', 'Org A');
    const orgB = await registerAndLogin('b@example.com', 'Org B');

    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${orgA.token}`)
      .attach('file', Buffer.from('Org A confidential content.'), { filename: 'a.txt', contentType: 'text/plain' });

    const listAsB = await request(app).get('/api/documents').set('Authorization', `Bearer ${orgB.token}`);
    expect(listAsB.status).toBe(200);
    expect(listAsB.body.documents).toHaveLength(0);
  });

  it('allows the uploader to delete their own document, cascading to chunks', async () => {
    const { token } = await registerAndLogin('deleter@example.com', 'Deleter Co');

    const upload = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('Content to be deleted.'), { filename: 'temp.txt', contentType: 'text/plain' });

    const documentId = upload.body.document.id;

    const deleteResponse = await request(app)
      .delete(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(204);

    const remainingChunks = getDb().prepare('SELECT * FROM document_chunks WHERE document_id = ?').all(documentId);
    expect(remainingChunks).toHaveLength(0);

    const getResponse = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getResponse.status).toBe(404);
  });
});
