import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new AppError(
          err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          400
        ));
      }
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query);
      Object.defineProperty(req, 'query', {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new AppError(
          err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          400
        ));
      }
      next(err);
    }
  };
}
