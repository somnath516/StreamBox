const request = require('supertest');
const app = require('../backend/server');
const path = require('path');

describe('StreamBox API Tests', () => {
  test('GET /movies returns array', async () => {
    const res = await request(app).get('/movies');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /upload rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/upload')
      .field('title', 'Test');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /upload rejects exe thumbnail after auth', async () => {
    const res = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer STREAMBOX_ADMIN')
      .field('title', 'Test')
      .attach('thumbnail', Buffer.from('not an image'), 'test.exe');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('POST /upload stores completed movie and DB row', async () => {
    const res = await request(app)
      .post('/upload')
      .set('Authorization', 'Bearer STREAMBOX_ADMIN')
      .field('title', 'API Upload Test')
      .field('description', 'Created by automated test')
      .attach('movie', Buffer.alloc(2048, 1), 'api-upload-test.mp4');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.movie.id).toBeTruthy();
    expect(res.body.movie.movie).toMatch(/^[0-9a-f-]{36}\.mp4$/);

    await request(app)
      .delete(`/movies/${res.body.movie.id}`)
      .set('Authorization', 'Bearer STREAMBOX_ADMIN');
  });

  test('GET /health OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
