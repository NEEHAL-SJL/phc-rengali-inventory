import http from 'http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import PDFDocument from 'pdfkit';
import { Server } from 'socket.io';
import { z } from 'zod';
import { authenticate, authorize, signToken, verifyPassword, hashPassword, verifyToken } from './auth.js';
import { config } from './config.js';
import { audit, pool, query, withTransaction } from './db.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigin, credentials: true },
});
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const adminOrClinical = authorize('ADMIN', 'DOCTOR', 'COMPOUNDER');
const adminOnly = authorize('ADMIN');

function broadcastInventory() {
  io.emit('inventory:changed', { at: new Date().toISOString() });
}

function monthRange(month) {
  const safeMonth = month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(safeMonth)) {
    const error = new Error('Month must use YYYY-MM format');
    error.status = 400;
    throw error;
  }
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    const error = new Error('Invalid report month');
    error.status = 400;
    throw error;
  }
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { safeMonth, start, end };
}

function reportRange(queryParams) {
  const { startDate, endDate } = queryParams;
  if (!startDate && !endDate) {
    const range = monthRange(queryParams.month);
    return { ...range, label: range.safeMonth, mode: 'month' };
  }
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    const error = new Error('Custom report dates must use YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    const error = new Error('Invalid custom report date range');
    error.status = 400;
    throw error;
  }
  const exclusiveEnd = new Date(end);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return {
    safeMonth: `${startDate}_to_${endDate}`,
    label: `${startDate} to ${endDate}`,
    mode: 'custom',
    start,
    end: exclusiveEnd,
  };
}

function getLoginAttemptKey(req, username) {
  return `${req.ip}:${String(username || '').toLowerCase()}`;
}

function loginAllowed(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  return record.count < LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  record.count += 1;
  loginAttempts.set(key, record);
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

const medicineSchema = z.object({
  name: z.string().trim().min(2).max(120),
  genericName: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  unitType: z.string().trim().min(1).max(40),
  currentStock: z.coerce.number().int().min(0).default(0),
  minimumStock: z.coerce.number().int().min(0).default(0),
  batchNumber: z.string().trim().max(80).optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

const issueSchema = z.object({
  medicineId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  patientName: z.string().trim().max(120).optional().nullable(),
  comments: z.string().trim().max(500).optional().nullable(),
});

const restockSchema = z.object({
  medicineId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  supplierSource: z.string().trim().max(160).optional().nullable(),
  batchNumber: z.string().trim().max(80).optional().nullable(),
  expiryDate: z.string().optional().nullable(),
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'PHC Rengali Inventory API' }));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const body = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(1).max(128) }).parse(req.body);
  const attemptKey = getLoginAttemptKey(req, body.username);
  if (!loginAllowed(attemptKey)) {
    return res.status(429).json({ message: 'Too many login attempts. Try again later.' });
  }
  const { rows } = await query('SELECT * FROM users WHERE username = $1 AND is_active = TRUE', [body.username]);
  const user = rows[0];
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    recordFailedLogin(attemptKey);
    return res.status(401).json({ message: 'Invalid username or password' });
  }
  clearLoginAttempts(attemptKey);
  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      designation: user.designation,
      mustResetPassword: user.must_reset_password,
    },
  });
}));

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.get('/api/dashboard', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const { start, end } = monthRange(req.query.month);
  const [summary, issued, stockStatus, recent, lowStock, usage] = await Promise.all([
    query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS total_medicines,
        COUNT(*) FILTER (WHERE is_active = TRUE AND current_stock <= minimum_stock)::int AS low_stock,
        COUNT(*) FILTER (WHERE is_active = TRUE AND expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '90 days')::int AS expiring_soon,
        COALESCE(SUM(current_stock) FILTER (WHERE is_active = TRUE), 0)::int AS stock_units
      FROM medicines
    `),
    query('SELECT COALESCE(SUM(quantity), 0)::int AS total FROM issue_transactions WHERE issued_at >= $1 AND issued_at < $2', [start, end]),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE current_stock > minimum_stock)::int AS healthy,
        COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= minimum_stock)::int AS low,
        COUNT(*) FILTER (WHERE current_stock = 0)::int AS out,
        COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)::int AS expired
      FROM medicines WHERE is_active = TRUE
    `),
    query(`
      SELECT t.id, t.quantity, t.patient_name, t.issued_at, m.name AS medicine_name, u.full_name AS user_name
      FROM issue_transactions t
      JOIN medicines m ON m.id = t.medicine_id
      JOIN users u ON u.id = t.issued_by
      ORDER BY t.issued_at DESC
      LIMIT 8
    `),
    query(`
      SELECT id, name, current_stock, minimum_stock, unit_type
      FROM medicines
      WHERE is_active = TRUE AND current_stock <= minimum_stock
      ORDER BY current_stock ASC, name ASC
      LIMIT 8
    `),
    query(`
      SELECT m.name, SUM(t.quantity)::int AS quantity
      FROM issue_transactions t
      JOIN medicines m ON m.id = t.medicine_id
      WHERE t.issued_at >= $1 AND t.issued_at < $2
      GROUP BY m.name
      ORDER BY quantity DESC
      LIMIT 6
    `, [start, end]),
  ]);

  res.json({
    summary: { ...summary.rows[0], issuedThisMonth: issued.rows[0].total },
    stockStatus: stockStatus.rows[0],
    recentTransactions: recent.rows,
    lowStock: lowStock.rows,
    usage: usage.rows,
  });
}));

app.get('/api/medicines', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const search = `%${String(req.query.search || '').trim()}%`;
  const status = req.query.status || 'all';
  const params = [search];
  let statusSql = '';
  if (status === 'low') statusSql = 'AND current_stock <= minimum_stock';
  if (status === 'expired') statusSql = 'AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE';
  if (status === 'inactive') statusSql = 'AND is_active = FALSE';
  if (status === 'active') statusSql = 'AND is_active = TRUE';

  const { rows } = await query(`
    SELECT id, name, generic_name, category, unit_type, current_stock, minimum_stock,
           batch_number, expiry_date, is_active, created_at, updated_at
    FROM medicines
    WHERE ($1 = '%%' OR name ILIKE $1 OR generic_name ILIKE $1 OR category ILIKE $1)
      ${statusSql}
    ORDER BY is_active DESC, name ASC
  `, params);
  res.json({ medicines: rows });
}));

app.post('/api/medicines', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const body = medicineSchema.parse(req.body);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`
      INSERT INTO medicines (name, generic_name, category, unit_type, current_stock, minimum_stock, batch_number, expiry_date, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [body.name, body.genericName, body.category, body.unitType, body.currentStock, body.minimumStock, body.batchNumber, body.expiryDate || null, body.isActive]);
    await audit(client, req.user.id, 'CREATE_MEDICINE', 'medicine', rows[0].id, { name: body.name });
    return rows[0];
  });
  broadcastInventory();
  res.status(201).json({ medicine: result });
}));

app.put('/api/medicines/:id', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const body = medicineSchema.parse(req.body);
  const result = await withTransaction(async (client) => {
    const existingResult = await client.query('SELECT current_stock, name FROM medicines WHERE id = $1 FOR UPDATE', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return null;
    const { rows } = await client.query(`
      UPDATE medicines
      SET name=$1, generic_name=$2, category=$3, unit_type=$4, current_stock=$5, minimum_stock=$6,
          batch_number=$7, expiry_date=$8, is_active=$9, updated_at=NOW()
      WHERE id=$10
      RETURNING *
    `, [body.name, body.genericName, body.category, body.unitType, body.currentStock, body.minimumStock, body.batchNumber, body.expiryDate || null, body.isActive, req.params.id]);
    if (existing.current_stock !== body.currentStock) {
      await client.query(`
        INSERT INTO stock_adjustments (medicine_id, old_stock, new_stock, reason, adjusted_by)
        VALUES ($1,$2,$3,$4,$5)
      `, [req.params.id, existing.current_stock, body.currentStock, 'Manual stock adjustment from medicine edit', req.user.id]);
    }
    await audit(client, req.user.id, 'UPDATE_MEDICINE', 'medicine', rows[0].id, { name: body.name });
    return rows[0];
  });
  if (!result) return res.status(404).json({ message: 'Medicine not found' });
  broadcastInventory();
  return res.json({ medicine: result });
}));

app.post('/api/transactions/issue', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const body = issueSchema.parse(req.body);
  const result = await withTransaction(async (client) => {
    const medicineResult = await client.query('SELECT * FROM medicines WHERE id = $1 AND is_active = TRUE FOR UPDATE', [body.medicineId]);
    const medicine = medicineResult.rows[0];
    if (!medicine) {
      const error = new Error('Medicine not found or inactive');
      error.status = 404;
      throw error;
    }
    if (medicine.current_stock < body.quantity) {
      const error = new Error(`Only ${medicine.current_stock} ${medicine.unit_type} available`);
      error.status = 409;
      throw error;
    }
    const transaction = await client.query(`
      INSERT INTO issue_transactions (medicine_id, quantity, patient_name, comments, issued_by)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [body.medicineId, body.quantity, body.patientName, body.comments, req.user.id]);
    const updated = await client.query(
      'UPDATE medicines SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [body.quantity, body.medicineId],
    );
    await audit(client, req.user.id, 'ISSUE_MEDICINE', 'issue_transaction', transaction.rows[0].id, {
      medicineName: medicine.name,
      quantity: body.quantity,
      patientName: body.patientName,
    });
    return { transaction: transaction.rows[0], medicine: updated.rows[0] };
  });
  broadcastInventory();
  res.status(201).json(result);
}));

app.post('/api/restocks', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const body = restockSchema.parse(req.body);
  const result = await withTransaction(async (client) => {
    const medicineResult = await client.query('SELECT * FROM medicines WHERE id = $1 AND is_active = TRUE FOR UPDATE', [body.medicineId]);
    const medicine = medicineResult.rows[0];
    if (!medicine) {
      const error = new Error('Medicine not found or inactive');
      error.status = 404;
      throw error;
    }
    const restock = await client.query(`
      INSERT INTO restocks (medicine_id, quantity, supplier_source, batch_number, expiry_date, added_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [body.medicineId, body.quantity, body.supplierSource, body.batchNumber, body.expiryDate || null, req.user.id]);
    const updated = await client.query(`
      UPDATE medicines
      SET current_stock = current_stock + $1,
          batch_number = COALESCE($2, batch_number),
          expiry_date = COALESCE($3, expiry_date),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [body.quantity, body.batchNumber, body.expiryDate || null, body.medicineId]);
    await audit(client, req.user.id, 'RESTOCK_MEDICINE', 'restock', restock.rows[0].id, {
      medicineName: medicine.name,
      quantity: body.quantity,
      supplierSource: body.supplierSource,
    });
    return { restock: restock.rows[0], medicine: updated.rows[0] };
  });
  broadcastInventory();
  res.status(201).json(result);
}));

app.get('/api/transactions', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const { start, end } = monthRange(req.query.month);
  const { rows } = await query(`
    SELECT t.id, t.quantity, t.patient_name, t.comments, t.issued_at,
           m.name AS medicine_name, m.unit_type, u.full_name AS issued_by_name
    FROM issue_transactions t
    JOIN medicines m ON m.id = t.medicine_id
    JOIN users u ON u.id = t.issued_by
    WHERE t.issued_at >= $1 AND t.issued_at < $2
    ORDER BY t.issued_at DESC
  `, [start, end]);
  res.json({ transactions: rows });
}));

app.get('/api/restocks', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const { start, end } = monthRange(req.query.month);
  const { rows } = await query(`
    SELECT r.id, r.quantity, r.supplier_source, r.batch_number, r.expiry_date, r.added_at,
           m.name AS medicine_name, m.unit_type, u.full_name AS added_by_name
    FROM restocks r
    JOIN medicines m ON m.id = r.medicine_id
    JOIN users u ON u.id = r.added_by
    WHERE r.added_at >= $1 AND r.added_at < $2
    ORDER BY r.added_at DESC
  `, [start, end]);
  res.json({ restocks: rows });
}));

app.get('/api/audit-logs', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const { rows } = await query(`
    SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.created_at, u.full_name AS user_name
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC
    LIMIT 100
  `);
  res.json({ logs: rows });
}));

app.get('/api/users', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const { rows } = await query(`
    SELECT id, username, full_name, role, designation, is_active, must_reset_password, created_at
    FROM users ORDER BY created_at DESC
  `);
  res.json({ users: rows });
}));

app.post('/api/users', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(3),
    password: z.string().min(6),
    fullName: z.string().trim().min(2),
    role: z.enum(['ADMIN', 'DOCTOR', 'COMPOUNDER']),
    designation: z.string().trim().optional().nullable(),
  }).parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`
      INSERT INTO users (username, password_hash, full_name, role, designation, must_reset_password)
      VALUES ($1,$2,$3,$4,$5,TRUE)
      RETURNING id, username, full_name, role, designation, is_active, must_reset_password
    `, [body.username, passwordHash, body.fullName, body.role, body.designation]);
    await audit(client, req.user.id, 'CREATE_USER', 'user', rows[0].id, { username: body.username, role: body.role });
    return rows[0];
  });
  res.status(201).json({ user: result });
}));

app.patch('/api/users/:id/password', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const body = z.object({ password: z.string().min(6) }).parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`
      UPDATE users SET password_hash = $1, must_reset_password = TRUE, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, full_name, role, designation, is_active, must_reset_password
    `, [passwordHash, req.params.id]);
    if (!rows[0]) return null;
    await audit(client, req.user.id, 'RESET_USER_PASSWORD', 'user', rows[0].id, { username: rows[0].username });
    return rows[0];
  });
  if (!result) return res.status(404).json({ message: 'User not found' });
  return res.json({ user: result });
}));

app.patch('/api/users/:id/status', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const body = z.object({ isActive: z.boolean() }).parse(req.body);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`
      UPDATE users SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, full_name, role, designation, is_active, must_reset_password
    `, [body.isActive, req.params.id]);
    if (!rows[0]) return null;
    await audit(client, req.user.id, body.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'user', rows[0].id, { username: rows[0].username });
    return rows[0];
  });
  if (!result) return res.status(404).json({ message: 'User not found' });
  return res.json({ user: result });
}));

app.get('/api/reports/monthly', authenticate, adminOrClinical, asyncRoute(async (req, res) => {
  const { safeMonth, label, mode, start, end } = reportRange(req.query);
  const [transactions, restocks, usage, stock, logs] = await Promise.all([
    query(`
      SELECT t.quantity, t.patient_name, t.issued_at, m.name AS medicine_name, u.full_name AS user_name
      FROM issue_transactions t
      JOIN medicines m ON m.id = t.medicine_id
      JOIN users u ON u.id = t.issued_by
      WHERE t.issued_at >= $1 AND t.issued_at < $2
      ORDER BY t.issued_at DESC
    `, [start, end]),
    query(`
      SELECT r.quantity, r.supplier_source, r.added_at, m.name AS medicine_name, u.full_name AS user_name
      FROM restocks r
      JOIN medicines m ON m.id = r.medicine_id
      JOIN users u ON u.id = r.added_by
      WHERE r.added_at >= $1 AND r.added_at < $2
      ORDER BY r.added_at DESC
    `, [start, end]),
    query(`
      SELECT m.name, SUM(t.quantity)::int AS quantity
      FROM issue_transactions t
      JOIN medicines m ON m.id = t.medicine_id
      WHERE t.issued_at >= $1 AND t.issued_at < $2
      GROUP BY m.name ORDER BY quantity DESC
    `, [start, end]),
    query('SELECT name, current_stock, minimum_stock, unit_type, expiry_date FROM medicines WHERE is_active = TRUE ORDER BY name ASC'),
    query(`
      SELECT l.action, l.created_at, u.full_name AS user_name
      FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.created_at >= $1 AND l.created_at < $2
      ORDER BY l.created_at DESC
    `, [start, end]),
  ]);

  if (req.query.format !== 'pdf') {
    return res.json({
      month: safeMonth,
      label,
      mode,
      transactions: transactions.rows,
      restocks: restocks.rows,
      usage: usage.rows,
      stock: stock.rows,
      logs: logs.rows,
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="phc-rengali-report-${safeMonth}.pdf"`);
  const doc = new PDFDocument({ margin: 42, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(18).text('PHC RENGALI INVENTORY', { align: 'center' });
  doc.fontSize(14).text('Primary Health Care Center Rengali', { align: 'center' });
  doc.moveDown().fontSize(12).text(`${mode === 'custom' ? 'Custom Duration' : 'Monthly'} Medicine Inventory Report: ${label}`);
  doc.text(`Generated by: ${req.user.full_name} (${req.user.role})`);
  doc.text(`Generated at: ${new Date().toLocaleString('en-IN')}`);
  doc.moveDown();

  const section = (title) => doc.moveDown(0.7).fontSize(13).text(title, { underline: true }).moveDown(0.3).fontSize(9);
  section('Medicine-wise Usage Summary');
  usage.rows.forEach((row) => doc.text(`${row.name}: ${row.quantity}`));
  section('Issue Transactions');
  transactions.rows.slice(0, 80).forEach((row) => doc.text(`${new Date(row.issued_at).toLocaleString('en-IN')} | ${row.medicine_name} | Qty ${row.quantity} | ${row.patient_name || 'No patient'} | ${row.user_name}`));
  section('Restock Summary');
  restocks.rows.slice(0, 80).forEach((row) => doc.text(`${new Date(row.added_at).toLocaleString('en-IN')} | ${row.medicine_name} | +${row.quantity} | ${row.supplier_source || 'Source not recorded'} | ${row.user_name}`));
  section('Current Remaining Stock');
  stock.rows.forEach((row) => doc.text(`${row.name}: ${row.current_stock} ${row.unit_type} (Min: ${row.minimum_stock})`));
  section('User Activity Logs');
  logs.rows.slice(0, 80).forEach((row) => doc.text(`${new Date(row.created_at).toLocaleString('en-IN')} | ${row.user_name || 'System'} | ${row.action}`));
  doc.end();
}));

app.use((error, req, res, next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: 'Invalid request', errors: error.flatten() });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ message: error.message || 'Server error' });
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error('Missing token');
    const payload = verifyToken(token);
    const { rows } = await query(
      'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
      [payload.sub],
    );
    if (!rows[0]) throw new Error('Inactive user');
    socket.userId = payload.sub;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.emit('inventory:connected', { at: new Date().toISOString() });
});

server.listen(config.port, () => {
  console.log(`PHC Rengali Inventory API running on http://localhost:${config.port}`);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
