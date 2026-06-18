# PHC Rengali Inventory Management System

Complete medicine inventory system for Primary Health Care Center Rengali, built from the supplied product description and UI reference.

## Features

- JWT login with `ADMIN`, `DOCTOR`, and `COMPOUNDER` roles
- Dashboard with total medicines, low stock, expiring stock, monthly issue count, usage chart, and recent transactions
- Medicine add/edit/deactivate, batch number, expiry date, minimum stock, and negative-stock prevention
- Medicine issue workflow with optional patient name and comments
- Restock workflow with supplier/source, batch, and expiry history
- PostgreSQL database with transactions, restocks, stock adjustments, users, and audit logs
- Realtime inventory refresh using Socket.IO
- Offline queue for issue/restock entries when the browser loses connectivity
- Monthly report JSON and PDF export
- Docker setup for PostgreSQL, backend API, and frontend UI

## Local Setup

1. Copy environment file:

   ```powershell
   Copy-Item .env.example backend/.env
   ```

2. Start PostgreSQL:

   ```powershell
   docker compose up -d postgres
   ```

3. Install dependencies:

   ```powershell
   npm.cmd install
   npm.cmd run install:all
   ```

4. Seed demo data:

   ```powershell
   npm.cmd run seed
   ```

5. Run the app:

   ```powershell
   npm.cmd run dev
   ```

Frontend: http://localhost:5173  
Backend health: http://localhost:4000/api/health

## Authorized Accounts

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `PHC.ADMIN` | `PHCRENGALI@8679` |
| Doctor | `DR.PATNAIK` | `DRPATNAIK@72680` |
| Doctor | `DR.YADAV` | `DRYADAV@79685` |
| Pharmacist | `COMP.BEHERA` | `COMPBEHERA@87265` |

## Docker Deployment

Run the full stack:

```powershell
docker compose up --build
```

After the database starts, seed it once:

```powershell
docker compose exec backend node src/seed.js
```

## Free Cloud Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for a free deployment structure using Vercel for the frontend, Render for the backend API, and Neon or Supabase for PostgreSQL.

## API Overview

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET/POST/PUT /api/medicines`
- `POST /api/transactions/issue`
- `GET /api/transactions`
- `POST /api/restocks`
- `GET /api/restocks`
- `GET /api/reports/monthly?month=YYYY-MM`
- `GET /api/reports/monthly?month=YYYY-MM&format=pdf`
- `GET/POST/PATCH /api/users`
- `GET /api/audit-logs`

## Production Notes

- Change `JWT_SECRET` before deployment.
- Use strong admin passwords after the first login.
- Point `DATABASE_URL` to the production PostgreSQL instance.
- Keep database backups for monthly archive and accountability records.
