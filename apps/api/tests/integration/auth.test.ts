import request from 'supertest';
import { app, resetDatabase } from '../testUtils';
import { closeDb } from '../../src/db/database';

describe('Auth API', () => {
  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    closeDb();
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user and organization, returning a token', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'alice@example.com',
        password: 'supersecret1',
        name: 'Alice',
        organizationName: 'Alice Co'
      });

      expect(response.status).toBe(201);
      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.user.email).toBe('alice@example.com');
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.user.role).toBe('admin');
    });

    it('rejects duplicate email registration', async () => {
      const payload = {
        email: 'bob@example.com',
        password: 'supersecret1',
        name: 'Bob',
        organizationName: 'Bob Co'
      };
      await request(app).post('/api/auth/register').send(payload);
      const response = await request(app).post('/api/auth/register').send(payload);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/already exists/i);
    });

    it('rejects invalid input with a 400', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'not-an-email',
        password: 'short',
        name: '',
        organizationName: ''
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'carol@example.com',
        password: 'supersecret1',
        name: 'Carol',
        organizationName: 'Carol Co'
      });

      const response = await request(app).post('/api/auth/login').send({
        email: 'carol@example.com',
        password: 'supersecret1'
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toEqual(expect.any(String));
    });

    it('rejects an incorrect password without revealing which field was wrong', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'dave@example.com',
        password: 'supersecret1',
        name: 'Dave',
        organizationName: 'Dave Co'
      });

      const response = await request(app).post('/api/auth/login').send({
        email: 'dave@example.com',
        password: 'wrong-password'
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid email or password.');
    });

    it('rejects login for a nonexistent user with the same generic message', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'whatever1'
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid email or password.');
    });
  });
});
