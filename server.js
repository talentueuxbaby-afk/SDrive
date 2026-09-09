const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const db = new Database(path.join(__dirname, 'sdrive.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analyses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  odds_type INTEGER NOT NULL CHECK(odds_type IN(2,10)),
  status TEXT NOT NULL DEFAULT 'payment_pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 604800000
  }
}));

function phone(p) {
  p = String(p || '').replace(/[^\d+]/g, '');

  if (p.startsWith('+225')) p = p.slice(1);
  if (p.startsWith('225')) return p;
  if (p.startsWith('0')) return '225' + p.slice(1);

  return p;
}

function auth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Connexion requise.'
    });
  }

  next();
}

function admin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({
      error: 'Accès administrateur refusé.'
    });
  }

  next();
}

app.get('/', (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>S-Drive — Analyse des matchs</title>

      <style>
        :root {
          --navy:#0A1F3A;
          --blue:#00BFFF;
          --white:#FFF;
          --muted:#AFC1D4;
          --card:#102B4C;
          --line:#23486B;
        }

        * {
          box-sizing:border-box;
        }

        body {
          margin:0;
          min-height:100vh;
          font-family:Arial,sans-serif;
          background:var(--navy);
          color:#fff;
        }

        .container {
          width:min(100% - 32px,520px);
          margin:auto;
        }

        header {
          padding:22px 0;
          display:flex;
          justify-content:space-between;
          align-items:center;
        }

        .brand {
          display:flex;
          gap:10px;
          align-items:center;
        }

        .logo {
          width:105px;
          height:105px;
          display:block;
          object-fit:contain;
          margin:25px auto 10px;
        }

        .center {
          text-align:center;
        }

        .muted {
          color:var(--muted);
          line-height:1.55;
        }

        .card {
          background:var(--card);
          border:1px solid var(--line);
          border-radius:20px;
          padding:20px;
          margin:14px 0;
        }

        .btn {
          width:100%;
          padding:15px;
          border-radius:14px;
          font-weight:800;
          border:0;
          margin:8px 0;
          cursor:pointer;
          text-decoration:none;
          display:flex;
          justify-content:center;
        }

        .primary {
          background:var(--blue);
          color:#001b2d;
        }

        input {
          width:100%;
          padding:14px;
          margin:7px 0;
          border-radius:12px;
          border:1px solid #3c5f7e;
          background:#0b223d;
          color:#fff;
        }

        .notice {
          padding:12px;
          border-left:3px solid var(--blue);
          background:#0c2745;
          border-radius:8px;
          line-height:1.5;
          margin:10px 0;
        }

        .hidden {
          display:none !important;
        }
      </style>
    </head>

    <body>
      <main class="container">

        <section id="auth">

          <div class="center">
            <h1>S-Drive</h1>

            <p class="muted">
              Analyse des matchs
            </p>
          </div>

          <div class="card">
            <h2>Connexion</h2>

            <input
              id="loginPhone"
              type="tel"
              placeholder="Numéro de téléphone"
            >

            <input
              id="loginPassword"
              type="password"
              placeholder="Mot de passe"
            >

            <button class="btn primary" onclick="login()">
              Se connecter
            </button>
          </div>

          <div class="card">
            <h2>Créer un compte</h2>

            <input
              id="registerName"
              type="text"
              placeholder="Nom"
            >

            <input
              id="registerPhone"
              type="tel"
              placeholder="Numéro de téléphone"
            >

            <input
              id="registerPassword"
              type="password"
              placeholder="Mot de passe"
            >

            <button class="btn primary" onclick="register()">
              Créer mon compte
            </button>
          </div>

        </section>

      </main>

      <script>
        async function register() {
          const name = document.getElementById('registerName').value;
          const phone = document.getElementById('registerPhone').value;
          const password = document.getElementById('registerPassword').value;

          const response = await fetch('/api/register', {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body:JSON.stringify({
              name,
              phone,
              password
            })
          });

          const data = await response.json();

          alert(data.message || data.error);
        }

        async function login() {
          const phone = document.getElementById('loginPhone').value;
          const password = document.getElementById('loginPassword').value;

          const response = await fetch('/api/login', {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body:JSON.stringify({
              phone,
              password
            })
          });

          const data = await response.json();

          alert(data.message || data.error);
        }
      </script>

    </body>
    </html>
  `);
});

app.post('/api/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const userPhone = phone(req.body.phone);
    const password = String(req.body.password || '');

    if (!name || !userPhone || !password) {
      return res.status(400).json({
        error: 'Tous les champs sont obligatoires.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users(name, phone, password_hash)
      VALUES (?, ?, ?)
    `).run(name, userPhone, passwordHash);

    req.session.userId = result.lastInsertRowid;

    res.json({
      message: 'Compte créé avec succès.'
    });

  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(400).json({
        error: 'Ce numéro existe déjà.'
      });
    }

    res.status(500).json({
      error: 'Erreur serveur.'
    });
  }
});

app.post('/api/login', async (req, res) => {
  const userPhone = phone(req.body.phone);
  const password = String(req.body.password || '');

  const user = db.prepare(`
    SELECT * FROM users WHERE phone = ?
  `).get(userPhone);

  if (!user) {
    return res.status(401).json({
      error: 'Numéro ou mot de passe incorrect.'
    });
  }

  const valid = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!valid) {
    return res.status(401).json({
      error: 'Numéro ou mot de passe incorrect.'
    });
  }

  req.session.userId = user.id;

  res.json({
    message: 'Connexion réussie.'
  });
});

app.listen(PORT, () => {
  console.log('S-Drive démarré sur le port ' + PORT);
});
