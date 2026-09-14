import 'reflect-metadata';
import express, { Express, Request, Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from '../dist/app.module';

let cachedServer: Express | null = null;

async function bootstrapServer(): Promise<Express> {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);

  app.use(helmet());
  const webOrigin = configService.get<string>('WEB_ORIGIN');
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (
        !webOrigin ||
        webOrigin === '*' ||
        origin === webOrigin ||
        origin.endsWith('.vercel.app') ||
        origin.startsWith('http://localhost:')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.init();
  return server;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  const origin = (req.headers && (req.headers.origin as string)) || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  );

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (!cachedServer) {
      cachedServer = await bootstrapServer();
    }
    cachedServer(req, res);
  } catch (error: unknown) {
    console.error('Serverless function bootstrap error:', error);
    const err = error as Error;
    res.status(500).json({
      statusCode: 500,
      message: 'Serverless function bootstrap failed',
      error: err?.message || String(error),
      stack: err?.stack || null,
    });
  }
}
