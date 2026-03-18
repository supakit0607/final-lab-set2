require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { pool } = require('./db/db');
const tasksRouter = require('./routes/tasks');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use('/api/tasks', tasksRouter);

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      // Fallback: สร้าง table ถ้ายังไม่มี (Railway อาจไม่รัน init.sql อัตโนมัติ)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id          SERIAL PRIMARY KEY,
          user_id     INTEGER      NOT NULL,
          username    VARCHAR(50),
          title       VARCHAR(200) NOT NULL,
          description TEXT,
          status      VARCHAR(20)  DEFAULT 'TODO',
          priority    VARCHAR(10)  DEFAULT 'medium',
          created_at  TIMESTAMP    DEFAULT NOW(),
          updated_at  TIMESTAMP    DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS logs (
          id         SERIAL       PRIMARY KEY,
          level      VARCHAR(10)  NOT NULL,
          event      VARCHAR(100) NOT NULL,
          user_id    INTEGER,
          message    TEXT,
          meta       JSONB,
          created_at TIMESTAMP    DEFAULT NOW()
        );
      `);
      break;
    } catch (e) {
      console.log(`[task] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`[task-service] Running on :${PORT}`));
}
start();
