import cookieSession from 'cookie-session';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import morgan from 'morgan';
import path from 'path';
import { openAiRouter } from './ai/open-ai-router';
import { authRouter } from './auth/auth-router';
import { initOidcClient } from './auth/oidc-client';
import { requireSession } from './auth/require-session';
import { booksRouter } from './books/books-router';
import { appConfig } from './config';
import { devicesRouter } from './devices/devices-router';
import { db } from './knex';
import { kopluginRouter } from './koplugin/koplugin-router';
import { kosyncRouter } from './kosync/kosync-router';
import { openLibraryRouter } from './open-library/open-library-router';
import { statsRouter } from './stats/stats-router';
import { uploadRouter } from './upload/upload-router';

async function setupServer() {
  const app = express();
  // Increase the limit to be able to upload the whole database
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(morgan('tiny'));

  // Needed for secure cookies behind a reverse proxy
  app.set('trust proxy', 1);
  app.use(
    cookieSession({
      name: 'koinsight',
      secret: appConfig.auth.sessionSecret,
      httpOnly: true,
      sameSite: 'lax',
      secure: appConfig.auth.appUrl.startsWith('https://'),
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    })
  );

  app.use('/', kosyncRouter); // Needs to be mounted at root to follow KoSync API
  app.use('/api/auth', authRouter);
  app.use('/api/plugin', kopluginRouter); // Authenticated with sync key headers
  app.use('/api/devices', requireSession, devicesRouter);
  app.use('/api/books', requireSession, booksRouter);
  app.use('/api/stats', requireSession, statsRouter);
  app.use('/api/upload', requireSession, uploadRouter);
  app.use('/api/open-library', requireSession, openLibraryRouter);
  app.use('/api/ai', requireSession, openAiRouter);

  // Serve react app
  app.use(express.static(appConfig.webBuildPath));
  app.get(/.*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(appConfig.webBuildPath, 'index.html'));
  });

  // Start :)
  const server = app.listen(appConfig.port, appConfig.hostname, () => {
    console.info(`KoInsight back-end is running on http://${appConfig.hostname}:${appConfig.port}`);
  });

  return server;
}

function stopServer(signal: NodeJS.Signals, server: Server) {
  console.log(`Received ${signal.toString()}. Gracefully shutting down...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
}

async function main() {
  console.log('Running database migrations');
  await db.migrate.latest({ directory: path.join(__dirname, 'db', 'migrations') });
  console.log('Database migrated successfully');

  await initOidcClient();

  setupServer().then((server) => {
    process.on('SIGINT', (signal) => stopServer(signal, server));
    process.on('SIGTERM', (signal) => stopServer(signal, server));
  });
}

main();
