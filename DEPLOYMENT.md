# Free Deployment Structure

Use three services:

1. Frontend: Vercel free plan
2. Backend API: Render free web service
3. PostgreSQL database: Neon or Supabase free plan

## Repository Layout

```text
phc-rengali-inventory/
  frontend/              React + Vite app
  backend/               Express API
  database/schema.sql    PostgreSQL schema
  docker-compose.yml     Local Docker setup
  README.md              Project overview
```

## Database

Create a free PostgreSQL database on Neon or Supabase.

Run the SQL from `database/schema.sql` in the database SQL editor.

Copy the database connection string. It will look similar to:

```text
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

## Backend On Render

Create a new Render Web Service connected to this GitHub repository.

Settings:

```text
Root Directory: backend
Runtime: Node
Build Command: npm install --omit=dev
Start Command: npm start
```

Environment variables:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=<your Neon or Supabase connection string>
JWT_SECRET=<create a long random secret>
CLIENT_ORIGIN=<your Vercel frontend URL>
```

After the first deploy, run this once from Render Shell:

```bash
npm run seed
```

This creates the required hospital user accounts.

## Frontend On Vercel

Create a new Vercel project connected to this GitHub repository.

Settings:

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Environment variable:

```text
VITE_API_URL=<your Render backend URL>
```

Example:

```text
VITE_API_URL=https://phc-rengali-inventory-api.onrender.com
```

## Required Login Accounts

```text
Administrator: PHC.ADMIN / PHCRENGALI@8679
Doctor 1:      DR.PATNAIK / DRPATNAIK@72680
Doctor 2:      DR.YADAV / DRYADAV@79685
Pharmacist:    COMP.BEHERA / COMPBEHERA@87265
```

## Local Development

Run with Docker:

```bash
docker compose up --build
```

Open:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
```

Run without Docker:

```bash
npm run install:all
npm run seed
npm run dev
```

## Production Notes

Set a strong `JWT_SECRET` before deployment.

Keep the PostgreSQL database private. Do not commit real `.env` files.

If the frontend cannot log in after deployment, confirm `CLIENT_ORIGIN` on Render exactly matches the Vercel URL and `VITE_API_URL` on Vercel exactly matches the Render URL.
