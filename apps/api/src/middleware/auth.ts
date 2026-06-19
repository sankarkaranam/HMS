import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { AppError } from '../lib/errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    clinicId: string;
    role: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Missing authorization header', 401));
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { sub: payload.sub, clinicId: payload.clinicId, role: payload.role };
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

// Ensure staff can only access their own clinic's data
export function requireClinicAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const clinicIdFromParam = req.params.clinicId;
  if (clinicIdFromParam && req.user?.clinicId !== clinicIdFromParam) {
    return next(new AppError('Access denied to this clinic', 403));
  }
  next();
}
