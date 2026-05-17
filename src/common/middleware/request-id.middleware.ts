import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existingRequestId = req.header('X-Request-ID') || req.header('x-request-id');
  const requestId = typeof existingRequestId === 'string' && existingRequestId.trim().length > 0
    ? existingRequestId
    : randomUUID();

  req.headers['x-request-id'] = requestId as any;
  res.setHeader('X-Request-ID', requestId);
  (req as any).requestId = requestId;

  next();
}
