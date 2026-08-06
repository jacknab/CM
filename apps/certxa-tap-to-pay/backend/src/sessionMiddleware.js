const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const pool = require('./db');

const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set — must match the main certxa.com app exactly');
}

// Reads the SAME sessions table + secret as the main certxa.com app, so
// a certxa.sid cookie issued by the website is valid here too. This
// backend never creates sessions (resave/saveUninitialized: false) —
// it only ever reads ones the main app already created at login.
const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: 'sessions' }),
  name: 'certxa.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
});

module.exports = sessionMiddleware;
