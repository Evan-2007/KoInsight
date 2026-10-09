import express from 'express';
import request from 'supertest';
import { Book, Device } from '@koinsight/common/types';
import { createBookDevice } from '../db/factories/book-device-factory';
import { createBook } from '../db/factories/book-factory';
import { createDevice } from '../db/factories/device-factory';
import { db } from '../knex';
import { booksRouter } from './books-router';
import { TEST_USER_ID, asTestUser } from '../db/factories/test-user';

describe('books-router', () => {
  const app = express();
  app.use(express.json());
  app.use(asTestUser);
  app.use('/books', booksRouter);

  let device: Device;

  beforeEach(async () => {
    device = await createDevice(db, { user_id: TEST_USER_ID });
  });

  // Books are only visible to users that have them on one of their devices
  async function createOwnedBook(overrides: Partial<Book> = {}) {
    const book = await createBook(db, overrides);
    await createBookDevice(db, book, device);
    return book;
  }

  describe('GET /books', () => {
    it('returns all books as JSON', async () => {
      await createOwnedBook({ title: 'Book 1' });

      let response = await request(app).get('/books');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toEqual(expect.objectContaining({ title: 'Book 1' }));

      await createOwnedBook({ title: 'Book 2' });

      response = await request(app).get('/books');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[1]).toEqual(expect.objectContaining({ title: 'Book 2' }));
    });

    it('excludes hidden books by default', async () => {
      await createOwnedBook({ title: 'Visible Book', soft_deleted: false });
      await createOwnedBook({ title: 'Hidden Book', soft_deleted: true });

      const response = await request(app).get('/books');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Visible Book');
    });

    it('includes hidden books when showHidden=true', async () => {
      await createOwnedBook({ title: 'Visible Book', soft_deleted: false });
      await createOwnedBook({ title: 'Hidden Book', soft_deleted: true });

      const response = await request(app).get('/books?showHidden=true');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /books/:bookId', () => {
    it('returns a book by id', async () => {
      const book = await createOwnedBook({ title: 'Test Book' });

      const response = await request(app).get(`/books/${book.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ title: 'Test Book' }));
    });
  });

  describe('DELETE /books/:bookId', () => {
    it('deletes a book', async () => {
      const book = await createOwnedBook({ title: 'Book to Delete' });

      const response = await request(app).delete(`/books/${book.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Book deleted' });
    });
  });

  describe('PUT /books/:bookId/hide', () => {
    it('hides a book', async () => {
      const book = await createOwnedBook({ title: 'Book to Hide', soft_deleted: false });

      const response = await request(app).put(`/books/${book.id}/hide`).send({ hidden: true });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Book hidden' });
    });

    it('shows a hidden book', async () => {
      const book = await createOwnedBook({ title: 'Hidden Book', soft_deleted: true });

      const response = await request(app).put(`/books/${book.id}/hide`).send({ hidden: false });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Book shown' });
    });

    it('returns 400 when hidden field is missing', async () => {
      const book = await createOwnedBook();

      const response = await request(app).put(`/books/${book.id}/hide`).send({});
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required fields' });
    });
  });

  describe('POST /books/:bookId/genres', () => {
    it('adds a genre to a book', async () => {
      const book = await createOwnedBook();

      const response = await request(app)
        .post(`/books/${book.id}/genres`)
        .send({ genreName: 'Fantasy' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Genre added' });
    });

    it('returns 400 when genreName is missing', async () => {
      const book = await createOwnedBook();

      const response = await request(app).post(`/books/${book.id}/genres`).send({});
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required fields' });
    });
  });

  describe('PUT /books/:bookId/reference_pages', () => {
    it('updates reference pages', async () => {
      const book = await createOwnedBook({ reference_pages: 100 });

      const response = await request(app)
        .put(`/books/${book.id}/reference_pages`)
        .send({ reference_pages: 250 });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Reference pages updated' });
    });

    it('returns 400 when reference_pages is missing', async () => {
      const book = await createOwnedBook();

      const response = await request(app).put(`/books/${book.id}/reference_pages`).send({});
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required fields' });
    });
  });
});
