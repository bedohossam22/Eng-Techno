import 'reflect-metadata';
import type { Request, Response } from 'express';

let cachedServer: any = null;

async function bootstrapServer() {
  const express = require('express');
  const { NestFactory } = require('@nestjs/core');
  const { ExpressAdapter } = require('@nestjs/platform-express');
  const { ValidationPipe } = require('@nestjs/common');
  const { ConfigService } = require('@nestjs/config');
  const helmet = require('helmet');
  const { AppModule } = require('../dist/app.module');

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);

  app.use(helmet());
  const webOrigin = configService.get('WEB_ORIGIN');
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

export default async function handler(req: Request, res: Response) {
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
    return cachedServer(req, res);
  } catch (error: any) {
    console.error('Serverless function error:', error);
    return res.status(500).json({
      statusCode: 500,
      message: 'Serverless function bootstrap failed',
      error: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
}
