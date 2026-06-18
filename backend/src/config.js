import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  databaseUrl: process.env.DATABASE_URL || 'postgres://phc_user:phc_password@localhost:5432/phc_inventory',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
