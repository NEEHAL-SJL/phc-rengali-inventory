import { hashPassword } from './auth.js';
import { pool, query } from './db.js';

const medicines = [];

async function upsertUser(username, password, fullName, role, designation) {
  const passwordHash = await hashPassword(password);
  await query(`
    INSERT INTO users (username, password_hash, full_name, role, designation)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (username) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        designation = EXCLUDED.designation,
        is_active = TRUE,
        must_reset_password = FALSE,
        updated_at = NOW()
  `, [username, passwordHash, fullName, role, designation]);
}

async function seed() {
  await upsertUser('PHC.ADMIN', 'PHCRENGALI@8679', 'PHC Administrator', 'ADMIN', 'Administrator');
  await upsertUser('DR.PATNAIK', 'DRPATNAIK@72680', 'Dr. Patnaik', 'DOCTOR', 'Doctor');
  await upsertUser('DR.YADAV', 'DRYADAV@79685', 'Dr. Yadav', 'DOCTOR', 'Doctor');
  await upsertUser('COMP.BEHERA', 'COMPBEHERA@87265', 'Comp. Behera', 'COMPOUNDER', 'Pharmacist');

  for (const item of medicines) {
    await query(`
      INSERT INTO medicines (name, generic_name, category, unit_type, current_stock, minimum_stock, batch_number, expiry_date)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8
      WHERE NOT EXISTS (
        SELECT 1 FROM medicines WHERE LOWER(name) = LOWER($1)
      )
    `, item);
  }

  console.log('Seed complete');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
