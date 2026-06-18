import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: '12h' },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing authorization token' });

  try {
    const payload = verifyToken(token);
    const { rows } = await query(
      `SELECT id, username, full_name, role, designation, is_active, must_reset_password
       FROM users WHERE id = $1 AND is_active = TRUE`,
      [payload.sub],
    );
    if (!rows[0]) return res.status(401).json({ message: 'User is inactive or not found' });
    req.user = rows[0];
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission for this action' });
    }
    return next();
  };
}
