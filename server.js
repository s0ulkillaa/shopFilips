const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const rootDir = __dirname;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'filips',
  password: process.env.DB_PASSWORD || 'filips',
  database: process.env.DB_NAME || 'shopfilips',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      cognome VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  `);
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha256')
    .toString('hex');
}

function normalizeUserPayload(body) {
  return {
    nome: String(body.nome || '').trim(),
    cognome: String(body.cognome || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    password: String(body.password || ''),
  };
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(rootDir));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, message: 'Database connected' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Database unavailable', details: error.message });
  }
});

app.post('/api/register', async (req, res) => {
  const payload = normalizeUserPayload(req.body);

  if (!payload.nome || !payload.cognome || !payload.email || !payload.password) {
    return res.status(400).json({ message: 'Tutti i campi sono obbligatori.' });
  }

  if (payload.password.length < 8) {
    return res.status(400).json({ message: 'La password deve avere almeno 8 caratteri.' });
  }

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [payload.email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: 'Esiste già un account con questa email.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(payload.password, salt);

    await pool.query(
      `INSERT INTO users (nome, cognome, email, password_hash, password_salt)
       VALUES ($1, $2, $3, $4, $5)`,
      [payload.nome, payload.cognome, payload.email, passwordHash, salt]
    );

    return res.status(201).json({ success: true, message: 'Registrazione completata.' });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Impossibile completare la registrazione.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email e password sono obbligatorie.' });
  }

  try {
    const result = await pool.query(
      'SELECT nome, cognome, email, password_hash, password_salt FROM users WHERE email = $1',
      [String(email).trim().toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Email o password non corretti.' });
    }

    const passwordHash = hashPassword(String(password), user.password_salt);
    if (passwordHash !== user.password_hash) {
      return res.status(401).json({ message: 'Email o password non corretti.' });
    }

    return res.json({
      success: true,
      user: {
        nome: user.nome,
        cognome: user.cognome,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Impossibile effettuare l\'accesso.' });
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Endpoint non trovato.' });
  }
  return res.sendFile(path.join(rootDir, 'index.html'));
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize the database:', error);
    process.exit(1);
  });
