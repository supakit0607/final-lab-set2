require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { pool } = require('./db/db');
const authRouter = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      // Fallback: สร้าง table ถ้ายังไม่มี (Railway อาจไม่รัน init.sql อัตโนมัติ)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id            SERIAL PRIMARY KEY,
          username      VARCHAR(50)  UNIQUE NOT NULL,
          email         VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role          VARCHAR(20)  DEFAULT 'member',
          created_at    TIMESTAMP    DEFAULT NOW(),
          last_login    TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS logs (
          id         SERIAL       PRIMARY KEY,
          level      VARCHAR(10)  NOT NULL,
          event      VARCHAR(100) NOT NULL,
          user_id    INTEGER,
          ip_address VARCHAR(45),
          message    TEXT,
          meta       JSONB,
          created_at TIMESTAMP    DEFAULT NOW()
        );
      `);
      break;
    } catch (e) {
      console.log(`[auth] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`[auth-service] Running on :${PORT}`));
}
start();
