import { seed } from '../src/seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to server/.env and fill it in.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed synthetic accounts in production.');
  process.exit(1);
}
await seed(process.env.DATABASE_URL, {
  staffPassword: process.env.SEED_STAFF_PASSWORD ?? 'staff-demo-pass',
  doctorPassword: process.env.SEED_DOCTOR_PASSWORD ?? 'doctor-demo-pass',
  adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'admin-demo-pass',
});
console.log('Seeded departments and test accounts: staff.test, doctor.test, admin.test (patients use the dev test session).');
