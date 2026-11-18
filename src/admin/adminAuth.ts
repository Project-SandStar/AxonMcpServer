/**
 * Auth for the /admin API: Basic auth against the user store, and the admin
 * role check. A user access key (Bearer) never works here.
 */
import { Request, Response, NextFunction } from 'express';
import type { UserStore, User } from './userStore.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Basic Auth middleware using UserStore
 */
export function basicAuthWithUserStore(userStore: Pick<UserStore, 'authenticate'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Axon MCP Admin"');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const base64 = authHeader.split(' ')[1];
    const [username, password] = Buffer.from(base64, 'base64').toString().split(':');

    const user = userStore.authenticate(username, password);
    if (user) {
      req.user = user;
      return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Axon MCP Admin"');
    return res.status(401).json({ error: 'Invalid credentials' });
  };
}

/**
 * Require admin role middleware
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}
