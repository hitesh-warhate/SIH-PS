import pg from 'pg';

// Calendar dates (a date of birth, the date on a prescription) stay plain "YYYY-MM-DD" strings. By default pg turns them into a
// Date at local midnight, which becomes the previous day in UTC for a server running east of Greenwich (such as India).
pg.types.setTypeParser(1082, (value) => value);
