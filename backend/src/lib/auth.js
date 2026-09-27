import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'change-this-development-secret';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role?.roleCode || null }, secret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

export function authRequired(req, res, next) {
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    req.user = { id: null, devBypass: true, role: 'ADMIN' };
    return next();
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, secret());
    req.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
