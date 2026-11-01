import bcrypt from 'bcryptjs';
import pg from 'pg';

// Synthetic data only. Never run against a database holding real patient data.
export const SEED_DEPARTMENTS = [
  { name: 'OPD Medicine', ayush: false },
  { name: 'OPD Paediatrics', ayush: false },
  { name: 'AYUSH Kayachikitsa', ayush: true },
];

export async function seed(databaseUrl, { staffPassword, doctorPassword, adminPassword }) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const d of SEED_DEPARTMENTS) {
      await client.query('INSERT INTO departments (name, ayush) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [d.name, d.ayush]);
    }
    const { rows } = await client.query("SELECT id FROM departments WHERE name = 'OPD Medicine'");
    const users = [
      ['staff', 'Test Staff', 'staff.test', staffPassword],
      ['doctor', 'Dr. Test Doctor', 'doctor.test', doctorPassword],
      ...(adminPassword ? [['admin', 'Test Admin', 'admin.test', adminPassword]] : []),
    ];
    for (const [role, fullName, username, password] of users) {
      await client.query(
        `INSERT INTO users (role, full_name, username, password_hash, department_id)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
        [role, fullName, username, bcrypt.hashSync(password, 10), rows[0].id],
      );
    }
  } finally {
    await client.end();
  }
}
