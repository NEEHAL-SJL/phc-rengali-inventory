import React, { Component, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Bell, CalendarDays, CheckCircle2, ClipboardList, FileDown, FileText,
  Home, LogOut, Menu, PackagePlus, Pill, Plus, RefreshCcw, Search, ShieldCheck,
  Stethoscope, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import {
  API_URL, api, clearSession, createInventorySocket, enqueueOffline, getOfflineQueue,
  getStoredUser, getToken, setOfflineQueue, storeSession,
} from './api.js';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'medicines', label: 'Medicines', icon: Pill },
  { id: 'issue', label: 'Issue Medicine', icon: ClipboardList },
  { id: 'restock', label: 'Restock', icon: PackagePlus },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'audit', label: 'Audit Logs', icon: ShieldCheck },
];

const emptyMedicine = {
  name: '',
  genericName: '',
  category: '',
  unitType: 'Tablet',
  currentStock: 0,
  minimumStock: 0,
  batchNumber: '',
  expiryDate: '',
  isActive: true,
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function number(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
      storeSession(data.token, data.user);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <div className="brand-row">
          <div className="brand-mark"><Stethoscope size={24} /></div>
          <div>
            <strong>PHC RENGALI INVENTORY</strong>
            <span>Primary Health Care Center Medicine Inventory</span>
          </div>
        </div>
        <div className="hero-copy">
          <h1>Smart inventory control for Primary Health Care Center Rengali</h1>
          <p>Track medicines, issue stock, restock supplies, generate monthly reports, and keep accountability records ready for government hospital operations.</p>
        </div>
        <div className="hospital-illustration" aria-hidden="true">
          <div className="sun" />
          <div className="building">
            <div className="board">PHC CENTER</div>
            <div className="cross">+</div>
            <div className="door" />
            <div className="window left" />
            <div className="window right" />
          </div>
          <div className="medicine-box">+</div>
        </div>
      </section>
      <section className="login-card">
        <h2>Welcome Back</h2>
        <p>Use your hospital account to continue.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary wide" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
        </form>

      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={22} /></div>
      <div>
        <span>{label}</span>
        <strong>{number(value)}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function Dashboard({ data }) {
  const status = data?.stockStatus || {};
  const total = Math.max(1, Number(status.healthy || 0) + Number(status.low || 0) + Number(status.out || 0) + Number(status.expired || 0));
  const conic = `conic-gradient(#059669 0 ${(status.healthy || 0) / total * 100}%, #f59e0b 0 ${((status.healthy || 0) + (status.low || 0)) / total * 100}%, #ef4444 0 ${((status.healthy || 0) + (status.low || 0) + (status.out || 0)) / total * 100}%, #64748b 0 100%)`;

  return (
    <div className="view-stack">
      <div className="stats-grid">
        <StatCard icon={Pill} label="Total Medicines" value={data?.summary?.total_medicines} detail="Active items in system" tone="green" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={data?.summary?.low_stock} detail="Below minimum stock" tone="amber" />
        <StatCard icon={CalendarDays} label="Expiring Soon" value={data?.summary?.expiring_soon} detail="Within next 90 days" tone="red" />
        <StatCard icon={Activity} label="Issued This Month" value={data?.summary?.issuedThisMonth} detail="Total quantity issued" tone="blue" />
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><h3>Stock Overview</h3></div>
          <div className="donut-wrap">
            <div className="donut" style={{ background: conic }}><span>{number(data?.summary?.total_medicines)}<small>Total</small></span></div>
            <div className="legend">
              <span><i className="green-dot" /> Healthy Stock <b>{number(status.healthy)}</b></span>
              <span><i className="amber-dot" /> Low Stock <b>{number(status.low)}</b></span>
              <span><i className="red-dot" /> Out of Stock <b>{number(status.out)}</b></span>
              <span><i className="gray-dot" /> Expired <b>{number(status.expired)}</b></span>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title"><h3>Recent Transactions</h3></div>
          <table>
            <thead><tr><th>Medicine</th><th>Qty</th><th>Patient</th><th>User</th></tr></thead>
            <tbody>{(data?.recentTransactions || []).map((row) => (
              <tr key={row.id}><td>{row.medicine_name}</td><td>{row.quantity}</td><td>{row.patient_name || '-'}</td><td>{row.user_name}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><h3>Low Stock Alerts</h3></div>
          <table>
            <thead><tr><th>Medicine</th><th>Current</th><th>Minimum</th></tr></thead>
            <tbody>{(data?.lowStock || []).map((row) => (
              <tr key={row.id}><td>{row.name}</td><td>{row.current_stock} {row.unit_type}</td><td>{row.minimum_stock}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <section className="panel">
          <div className="panel-title"><h3>Monthly Usage</h3></div>
          <div className="bar-chart">
            {(data?.usage || []).map((row) => (
              <div className="bar-row" key={row.name}>
                <span>{row.name}</span>
                <div><i style={{ width: `${Math.min(100, (row.quantity / Math.max(...data.usage.map((u) => u.quantity), 1)) * 100)}%` }} /></div>
                <b>{row.quantity}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Medicines({ medicines, refresh }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const filtered = medicines.filter((m) => `${m.name} ${m.generic_name} ${m.category}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="view-stack">
      <div className="toolbar">
        <div className="search"><Search size={16} /><input placeholder="Search medicine, generic, category" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="primary" onClick={() => setEditing(emptyMedicine)}><Plus size={16} /> Add Medicine</button>
      </div>
      <section className="panel">
        <table>
          <thead><tr><th>Medicine</th><th>Generic</th><th>Stock</th><th>Min</th><th>Expiry</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{filtered.map((m) => (
            <tr key={m.id}>
              <td><strong>{m.name}</strong><small>{m.category}</small></td>
              <td>{m.generic_name}</td>
              <td>{m.current_stock} {m.unit_type}</td>
              <td>{m.minimum_stock}</td>
              <td>{m.expiry_date ? new Date(m.expiry_date).toLocaleDateString('en-IN') : '-'}</td>
              <td><span className={`pill ${!m.is_active ? 'gray' : m.current_stock <= m.minimum_stock ? 'amber' : 'green'}`}>{!m.is_active ? 'Inactive' : m.current_stock <= m.minimum_stock ? 'Low Stock' : 'In Stock'}</span></td>
              <td><button className="ghost" onClick={() => setEditing({
                id: m.id, name: m.name, genericName: m.generic_name, category: m.category, unitType: m.unit_type,
                currentStock: m.current_stock, minimumStock: m.minimum_stock, batchNumber: m.batch_number || '',
                expiryDate: m.expiry_date ? m.expiry_date.slice(0, 10) : '', isActive: m.is_active,
              })}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      {editing && <MedicineModal medicine={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

function MedicinePicker({ medicines, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = medicines.find((medicine) => medicine.id === value);
  const filtered = medicines.filter((medicine) =>
    `${medicine.name} ${medicine.generic_name} ${medicine.category}`.toLowerCase().includes(search.toLowerCase()),
  );

  function choose(medicine) {
    if (!medicine.is_active) return;
    onChange(medicine.id);
    setSearch('');
    setOpen(false);
  }

  return (
    <div className="medicine-picker">
      <button type="button" className="picker-trigger" onClick={() => setOpen(!open)}>
        <span>{selected ? selected.name : 'Select Medicine'}</span>
        {selected && <small>{selected.current_stock} {selected.unit_type} available</small>}
      </button>
      {selected && (
        <button type="button" className="picker-clear" onClick={() => onChange('')} title="Clear medicine">
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="picker-menu">
          <div className="search picker-search"><Search size={16} /><input autoFocus placeholder="Search medicine" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="picker-options">
            {filtered.length ? filtered.map((medicine) => (
              <button type="button" key={medicine.id} onClick={() => choose(medicine)} disabled={!medicine.is_active}>
                <strong>{medicine.name}</strong>
                <span>{medicine.generic_name} - {medicine.current_stock} {medicine.unit_type}{medicine.is_active ? '' : ' - inactive'}</span>
              </button>
            )) : <div className="picker-empty">No medicines found</div>}
            {medicines.length > 0 && !medicines.some((medicine) => medicine.is_active) && (
              <div className="picker-empty">All medicines are inactive. Activate a medicine in the Medicines tab before issuing or restocking.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MedicineModal({ medicine, onClose, onSaved }) {
  const [form, setForm] = useState(medicine);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      const method = form.id ? 'PUT' : 'POST';
      const path = form.id ? `/api/medicines/${form.id}` : '/api/medicines';
      await api(path, { method, body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h3>{form.id ? 'Edit Medicine' : 'Add Medicine'}</h3>
        <div className="form-grid">
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Generic Name<input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} /></label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label>Unit Type<input value={form.unitType} onChange={(e) => setForm({ ...form, unitType: e.target.value })} /></label>
          <label>Current Stock<input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} /></label>
          <label>Minimum Stock<input type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} /></label>
          <label>Batch Number<input value={form.batchNumber || ''} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} /></label>
          <label>Expiry Date<input type="date" value={form.expiryDate || ''} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active medicine</label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
      </form>
    </div>
  );
}

function TransactionForm({ medicines, type, onSaved }) {
  const [form, setForm] = useState({ medicineId: '', quantity: '', patientName: '', comments: '', supplierSource: '', batchNumber: '', expiryDate: '' });
  const [message, setMessage] = useState('');
  const isIssue = type === 'issue';
  async function submit(event) {
    event.preventDefault();
    setMessage('');
    if (!form.medicineId) {
      setMessage('Please select a medicine.');
      return;
    }
    const path = isIssue ? '/api/transactions/issue' : '/api/restocks';
    const payload = isIssue
      ? { medicineId: form.medicineId, quantity: form.quantity, patientName: form.patientName, comments: form.comments }
      : { medicineId: form.medicineId, quantity: form.quantity, supplierSource: form.supplierSource, batchNumber: form.batchNumber, expiryDate: form.expiryDate };
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      setMessage(isIssue ? 'Medicine issued successfully.' : 'Restock saved successfully.');
      setForm({ medicineId: '', quantity: '', patientName: '', comments: '', supplierSource: '', batchNumber: '', expiryDate: '' });
      onSaved();
    } catch (err) {
      if (!navigator.onLine || err.message === 'Failed to fetch') {
        enqueueOffline({ type, payload });
        setMessage('Saved offline. It will synchronize when connection returns.');
        setForm({ medicineId: '', quantity: '', patientName: '', comments: '', supplierSource: '', batchNumber: '', expiryDate: '' });
      } else {
        setMessage(err.message);
      }
    }
  }
  return (
    <section className="panel form-panel">
      <h3>{isIssue ? 'New Transaction' : 'Add Restock'}</h3>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>Medicine<MedicinePicker medicines={medicines} value={form.medicineId} onChange={(medicineId) => setForm({ ...form, medicineId })} /></label>
          <label>Quantity<input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
          {isIssue ? (
            <>
              <label>Patient Name<input value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} /></label>
              <label>Comments<textarea value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></label>
            </>
          ) : (
            <>
              <label>Supplier / Source<input value={form.supplierSource} onChange={(e) => setForm({ ...form, supplierSource: e.target.value })} /></label>
              <label>Batch Number<input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} /></label>
              <label>Expiry Date<input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
            </>
          )}
        </div>
        {message && <div className={`alert ${message.includes('success') ? 'success' : ''}`}>{message}</div>}
        <div className="form-actions"><button className="secondary" type="button" onClick={() => setForm({ medicineId: '', quantity: '', patientName: '', comments: '', supplierSource: '', batchNumber: '', expiryDate: '' })}>Clear</button><button className="primary">{isIssue ? 'Submit Transaction' : 'Save Restock'}</button></div>
      </form>
    </section>
  );
}

function Reports({ month, setMonth }) {
  const [report, setReport] = useState(null);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [reportMode, setReportMode] = useState('month');
  const [customRange, setCustomRange] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return { startDate: today, endDate: today };
  });

  function reportQuery() {
    if (reportMode === 'custom') {
      return `startDate=${customRange.startDate}&endDate=${customRange.endDate}`;
    }
    return `month=${month}`;
  }

  function reportFileLabel() {
    return reportMode === 'custom' ? `${customRange.startDate}_to_${customRange.endDate}` : month;
  }

  async function load() {
    setReport(await api(`/api/reports/monthly?${reportQuery()}`));
  }
  useEffect(() => { load(); }, [month, reportMode, customRange.startDate, customRange.endDate]);

  async function downloadPdf() {
    setDownloadMessage('');
    try {
      const response = await fetch(`${API_URL}/api/reports/monthly?${reportQuery()}&format=pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error('Could not generate PDF report');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `phc-rengali-report-${reportFileLabel()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloadMessage('PDF report downloaded.');
    } catch (err) {
      setDownloadMessage(err.message);
    }
  }

  return (
    <div className="view-stack">
      <div className="toolbar">
        <div className="segmented-control">
          <button type="button" className={reportMode === 'month' ? 'active' : ''} onClick={() => setReportMode('month')}>Month</button>
          <button type="button" className={reportMode === 'custom' ? 'active' : ''} onClick={() => setReportMode('custom')}>Custom Duration</button>
        </div>
        {reportMode === 'month' ? (
          <input className="month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        ) : (
          <div className="date-range">
            <label>From<input type="date" value={customRange.startDate} onChange={(event) => setCustomRange({ ...customRange, startDate: event.target.value })} /></label>
            <label>To<input type="date" value={customRange.endDate} onChange={(event) => setCustomRange({ ...customRange, endDate: event.target.value })} /></label>
          </div>
        )}
        <button className="primary" type="button" onClick={downloadPdf}><FileDown size={16} /> Download PDF Report</button>
      </div>
      {downloadMessage && <div className={`alert ${downloadMessage.includes('downloaded') ? 'success' : 'error'}`}>{downloadMessage}</div>}
      <div className="stats-grid compact">
        <StatCard icon={ClipboardList} label="Transactions" value={report?.transactions?.length} detail="Issue records" tone="blue" />
        <StatCard icon={PackagePlus} label="Restocks" value={report?.restocks?.length} detail="Incoming stock records" tone="green" />
        <StatCard icon={Pill} label="Medicines Used" value={report?.usage?.length} detail="Medicine-wise summary" tone="amber" />
        <StatCard icon={ShieldCheck} label="Activity Logs" value={report?.logs?.length} detail="Audit entries" tone="red" />
      </div>
      <section className="panel">
        <div className="panel-title"><h3>Medicine-wise Usage</h3></div>
        <table><thead><tr><th>Medicine</th><th>Total Issued</th></tr></thead><tbody>{(report?.usage || []).map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.quantity}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}

function SimpleTable({ rows, type }) {
  const isAudit = type === 'audit';
  return (
    <section className="panel">
      <table>
        <thead><tr>{isAudit ? <><th>Time</th><th>User</th><th>Action</th><th>Entity</th></> : <><th>Time</th><th>Medicine</th><th>Qty</th><th>User</th><th>Details</th></>}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            {isAudit ? <><td>{formatDate(r.created_at)}</td><td>{r.user_name || 'System'}</td><td>{r.action}</td><td>{r.entity_type}</td></> : <><td>{formatDate(r.issued_at || r.added_at)}</td><td>{r.medicine_name}</td><td>{r.quantity}</td><td>{r.issued_by_name || r.added_by_name}</td><td>{r.patient_name || r.supplier_source || '-'}</td></>}
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function UsersView() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', fullName: '', role: 'COMPOUNDER', designation: '' });
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api('/api/users');
    setUsers(data.users);
  }

  useEffect(() => { load(); }, []);

  async function createUser(event) {
    event.preventDefault();
    setMessage('');
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ username: '', password: '', fullName: '', role: 'COMPOUNDER', designation: '' });
      setMessage('User created successfully.');
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetPassword(user) {
    const password = window.prompt(`New password for ${user.username}`);
    if (!password) return;
    try {
      await api(`/api/users/${user.id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) });
      setMessage('Password reset saved.');
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function toggleStatus(user) {
    await api(`/api/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !user.is_active }) });
    load();
  }

  return (
    <div className="view-stack">
      <section className="panel form-panel">
        <h3>Create User</h3>
        <form onSubmit={createUser}>
          <div className="form-grid">
            <label>Full Name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
            <label>Username<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label>Password<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>ADMIN</option><option>DOCTOR</option><option>COMPOUNDER</option></select></label>
            <label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></label>
          </div>
          {message && <div className={`alert ${message.includes('success') || message.includes('saved') ? 'success' : ''}`}>{message}</div>}
          <div className="form-actions"><button className="primary"><Plus size={16} />Create User</button></div>
        </form>
      </section>
      <section className="panel">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.full_name}</strong><small>{u.designation || '-'}</small></td>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td><span className={`pill ${u.is_active ? 'green' : 'gray'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
              <td className="action-cell"><button className="ghost" onClick={() => resetPassword(u)}>Reset Password</button><button className="secondary" onClick={() => toggleStatus(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

function AppShell({ user, onLogout }) {
  const [active, setActive] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [queueCount, setQueueCount] = useState(getOfflineQueue().length);
  const [online, setOnline] = useState(navigator.onLine);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [checkingConnection, setCheckingConnection] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setStatusMessage('');
    try {
      const [dash, meds, trans, restockRows, auditRows] = await Promise.all([
        api(`/api/dashboard?month=${month}`),
        api('/api/medicines'),
        api(`/api/transactions?month=${month}`),
        api(`/api/restocks?month=${month}`),
        api('/api/audit-logs'),
      ]);
      setDashboard(dash);
      setMedicines(meds.medicines);
      setTransactions(trans.transactions);
      setRestocks(restockRows.restocks);
      setLogs(auditRows.logs);
      setLastUpdated(new Date());
      setStatusMessage('Inventory refreshed.');
    } catch (err) {
      setStatusMessage(err.message || 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function syncOfflineQueue() {
    if (!navigator.onLine) return;
    const queue = getOfflineQueue();
    const remaining = [];
    for (const item of queue) {
      try {
        const path = item.type === 'issue' ? '/api/transactions/issue' : '/api/restocks';
        await api(path, { method: 'POST', body: JSON.stringify(item.payload) });
      } catch {
        remaining.push(item);
      }
    }
    setOfflineQueue(remaining);
    if (queue.length !== remaining.length) refresh();
  }

  async function checkConnection() {
    setCheckingConnection(true);
    setStatusMessage('');
    try {
      await api('/api/health');
      setOnline(true);
      setStatusMessage('Connection is online.');
      await syncOfflineQueue();
    } catch {
      setOnline(false);
      setStatusMessage('Connection check failed.');
    } finally {
      setCheckingConnection(false);
    }
  }

  useEffect(() => { refresh(); }, [month]);
  useEffect(() => {
    const socket = createInventorySocket();
    socket.on('inventory:changed', refresh);
    const onlineHandler = () => { setOnline(true); syncOfflineQueue(); };
    const offlineHandler = () => setOnline(false);
    const queueHandler = () => setQueueCount(getOfflineQueue().length);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    window.addEventListener('offline-queue-changed', queueHandler);
    syncOfflineQueue();
    return () => {
      socket.disconnect();
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
      window.removeEventListener('offline-queue-changed', queueHandler);
    };
  }, []);

  const pageTitle = navItems.find((item) => item.id === active)?.label || 'Dashboard';
  const nav = navItems.filter((item) => item.id !== 'users' || user.role === 'ADMIN');
  const stockAlerts = [
    ...medicines
      .filter((medicine) => medicine.is_active && medicine.current_stock <= medicine.minimum_stock)
      .map((medicine) => ({
        id: `low-${medicine.id}`,
        tone: 'amber',
        title: 'Low stock',
        detail: `${medicine.name}: ${medicine.current_stock} ${medicine.unit_type} left, minimum ${medicine.minimum_stock}`,
      })),
    ...medicines
      .filter((medicine) => {
        if (!medicine.is_active || !medicine.expiry_date) return false;
        const expiry = new Date(medicine.expiry_date);
        const limit = new Date();
        limit.setDate(limit.getDate() + 90);
        return expiry <= limit;
      })
      .map((medicine) => ({
        id: `expiry-${medicine.id}`,
        tone: 'red',
        title: 'Expiry warning',
        detail: `${medicine.name} expires on ${new Date(medicine.expiry_date).toLocaleDateString('en-IN')}`,
      })),
  ];

  const content = useMemo(() => {
    if (active === 'dashboard') return <Dashboard data={dashboard} />;
    if (active === 'medicines') return <Medicines medicines={medicines} refresh={refresh} />;
    if (active === 'issue') return <TransactionForm medicines={medicines} type="issue" onSaved={refresh} />;
    if (active === 'restock') return <TransactionForm medicines={medicines} type="restock" onSaved={refresh} />;
    if (active === 'reports') return <Reports month={month} setMonth={setMonth} />;
    if (active === 'audit') return <SimpleTable rows={logs} type="audit" />;
    if (active === 'users') return <UsersView />;
    return null;
  }, [active, dashboard, medicines, logs, month, transactions, restocks]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-mark small"><Stethoscope size={18} /></div><strong>PHC RENGALI INVENTORY</strong></div>
        <nav>{nav.map(({ id, label, icon: Icon }) => (
          <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); setMobileOpen(false); }}><Icon size={17} />{label}</button>
        ))}</nav>
        <button className="logout" onClick={onLogout}><LogOut size={17} />Logout</button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={20} /></button>
          <div><h1>{pageTitle}</h1><span>Primary Health Care Center Rengali</span></div>
          <div className="topbar-actions">
            <button className={`connection ${online ? 'online' : 'offline'} ${checkingConnection ? 'checking' : ''}`} type="button" onClick={checkConnection} title="Check connection">
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {checkingConnection ? 'Checking...' : online ? 'Online' : 'Offline'}
              {queueCount > 0 ? ` (${queueCount})` : ''}
            </button>
            <button className={`icon-btn ${refreshing ? 'spinning' : ''}`} onClick={refresh} disabled={refreshing} title="Refresh inventory">
              <RefreshCcw size={18} />
            </button>
            <div className="bell-wrap">
              <button className="icon-btn bell-button" onClick={() => setAlertsOpen(!alertsOpen)} title="Stock alerts">
                <Bell size={18} />
                {stockAlerts.length > 0 && <span className="badge">{stockAlerts.length}</span>}
              </button>
              {alertsOpen && (
                <section className="alerts-popover">
                  <div className="popover-title">
                    <strong>Stock Alerts</strong>
                    <small>{stockAlerts.length ? `${stockAlerts.length} active` : 'All clear'}</small>
                  </div>
                  <div className="alerts-list">
                    {stockAlerts.length ? stockAlerts.slice(0, 8).map((alert) => (
                      <div className="alert-item" key={alert.id}>
                        <span className={`alert-dot ${alert.tone}`} />
                        <div><strong>{alert.title}</strong><small>{alert.detail}</small></div>
                      </div>
                    )) : (
                      <div className="alert-item">
                        <CheckCircle2 size={18} />
                        <div><strong>No active alerts</strong><small>Stock levels and expiries look okay.</small></div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
            <div className="user-chip"><span>{user.fullName || user.full_name}</span><small>{user.designation || user.role}</small></div>
          </div>
        </header>
        {statusMessage && <div className={`toast ${statusMessage.includes('failed') || statusMessage.includes('Request') ? 'error' : 'success'}`}>{statusMessage}{lastUpdated && <small> {lastUpdated.toLocaleTimeString('en-IN')}</small>}</div>}
        {content}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  function logout() {
    clearSession();
    setUser(null);
  }
  return (
    <ErrorBoundary>
      {user && getToken() ? <AppShell user={user} onLogout={logout} /> : <Login onLogin={setUser} />}
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset = () => {
    clearSession();
    localStorage.removeItem('phc_inventory_offline_queue');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
        window.location.reload();
      });
      return;
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-screen">
        <section>
          <div className="brand-mark"><Stethoscope size={24} /></div>
          <h1>PHC RENGALI INVENTORY</h1>
          <p>The app hit a browser startup problem. Clear the saved session and reload to continue.</p>
          <code>{this.state.error.message}</code>
          <button className="primary" onClick={this.reset}>Reset Browser Session</button>
        </section>
      </main>
    );
  }
}
