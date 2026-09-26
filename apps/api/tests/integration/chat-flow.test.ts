import request from 'supertest';
import { app, resetDatabase } from '../testUtils';
import { closeDb } from '../../src/db/database';

async function registerAndLogin(email: string, orgName: string) {
  const res = await request(app).post('/api/auth/register').send({
    email,
    password: 'supersecret1',
    name: 'Test User',
    organizationName: orgName
  });
  return { token: res.body.token as string, user: res.body.user };
}

async function uploadTextDocument(token: string, filename: string, content: string) {
  return request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from(content), { filename, contentType: 'text/plain' });
}

describe('Chat flow (end-to-end: ingest -> retrieve -> generate -> citations)', () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    closeDb();
  });

  it('answers a question using a citation from the relevant uploaded document', async () => {
    const { token } = await registerAndLogin('hr@example.com', 'HR Co');

    await uploadTextDocument(
      token,
      'leave-policy.txt',
      'Employees are entitled to twenty five days of annual leave per calendar year. ' +
        'Leave requests must be submitted at least two weeks in advance through the HR portal.'
    );
    await uploadTextDocument(
      token,
      'expenses-policy.txt',
      'All expense claims must be submitted within thirty days with an itemized receipt attached.'
    );

    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Leave question' });
    expect(conversationResponse.status).toBe(201);
    const conversationId = conversationResponse.body.conversation.id;

    const messageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'How many days of annual leave do employees get?' });

    expect(messageResponse.status).toBe(201);
    expect(messageResponse.body.answer).toEqual(expect.any(String));
    expect(messageResponse.body.citations.length).toBeGreaterThan(0);
    expect(messageResponse.body.citations[0].documentFilename).toBe('leave-policy.txt');

    // The full conversation, fetched back, should contain both persisted messages with citations attached.
    const conversationDetail = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(conversationDetail.status).toBe(200);
    expect(conversationDetail.body.conversation.messages).toHaveLength(2);
    expect(conversationDetail.body.conversation.messages[0].role).toBe('user');
    expect(conversationDetail.body.conversation.messages[1].role).toBe('assistant');
    expect(conversationDetail.body.conversation.messages[1].citations.length).toBeGreaterThan(0);
  });

  it('answers honestly when no relevant document exists, rather than fabricating an answer', async () => {
    const { token } = await registerAndLogin('empty@example.com', 'Empty Co');

    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const conversationId = conversationResponse.body.conversation.id;

    const messageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'What is our parental leave policy?' });

    expect(messageResponse.status).toBe(201);
    expect(messageResponse.body.citations).toHaveLength(0);
    expect(messageResponse.body.answer).toMatch(/don't have any relevant information/i);
  });

  it('never retrieves another organization\'s document content into an answer', async () => {
    const orgA = await registerAndLogin('secret@example.com', 'Secret Org');
    const orgB = await registerAndLogin('outsider@example.com', 'Outsider Org');

    await uploadTextDocument(
      orgA.token,
      'confidential.txt',
      'The secret launch code for Project Falcon is ALPHA-NINE-NINE.'
    );

    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${orgB.token}`)
      .send({});
    const conversationId = conversationResponse.body.conversation.id;

    const messageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .send({ content: 'What is the secret launch code for Project Falcon?' });

    expect(messageResponse.status).toBe(201);
    expect(messageResponse.body.citations).toHaveLength(0);
    expect(messageResponse.body.answer).not.toMatch(/ALPHA-NINE-NINE/);
  });

  it('rejects access to a conversation belonging to another user', async () => {
    const userA = await registerAndLogin('convowner@example.com', 'Convo Org A');
    const userB = await registerAndLogin('convintruder@example.com', 'Convo Org B');

    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});
    const conversationId = conversationResponse.body.conversation.id;

    const intrusion = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(intrusion.status).toBe(404);
  });
});
