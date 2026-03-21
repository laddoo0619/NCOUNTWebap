import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';
import { logAudit } from '../services/auditService';

const router = Router();

router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await db('users').where({ username, is_active: true }).first();
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    await logAudit({
      userId: user.id,
      username: user.username,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db('users')
      .where({ id: req.user!.id })
      .select('id', 'username', 'email', 'role', 'last_login_at', 'created_at')
      .first();
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/register', authenticate, authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email, and password are required' });
      return;
    }

    const existing = await db('users').where({ username }).orWhere({ email }).first();
    if (existing) {
      res.status(409).json({ error: 'Username or email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db('users')
      .insert({
        username,
        email,
        password_hash: passwordHash,
        role: role || 'technician',
      })
      .returning(['id', 'username', 'email', 'role', 'created_at']);

    await logAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      details: { newUsername: username, role: role || 'technician' },
      ipAddress: req.ip,
    });

    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

export default router;
