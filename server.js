const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);

/* =========================
   CONFIGURATION
========================= */

const APP_URL = process.env.APP_URL || 'https://TON-LIEN-APPLICATION.com';

const WAVE_URL =
  'https://pay.wave.com/m/M_ci_kpNTVGT9JGah/c/ci/?amount=1000';

const WHATSAPP_NUMBER =
  process.env.WHATSAPP_NUMBER || '2250554740711';

/* =========================
   DATABASE
========================= */

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

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret:
    process.env.SESSION_SECRET ||
    'change-this-session-secret',

  resave: false,

  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 604800000
  }
}));

/* =========================
   UTILITAIRES
========================= */

function phone(p) {
  p = String(p || '').replace(/[^\d+]/g, '');

  if (p.startsWith('+225')) {
    p = p.slice(1);
  }

  if (p.startsWith('225')) {
    return p;
  }

  if (p.startsWith('0')) {
    return '225' + p.slice(1);
  }

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

function whatsappLink(message) {
  const number = String(WHATSAPP_NUMBER)
    .replace(/[^\d]/g, '');

  return (
    'https://wa.me/' +
    number +
    '?text=' +
    encodeURIComponent(message)
  );
}

/* =========================
   PAGE PRINCIPALE
========================= */

app.get('/', (req, res) => {

  const loggedIn = Boolean(req.session.userId);

  res.send(`
<!doctype html>

<html lang="fr">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>S-Drive — Analyse des matchs</title>

<style>

:root {
  --navy:#071A2D;
  --blue:#00BFFF;
  --white:#FFFFFF;
  --muted:#AFC1D4;
  --card:#102B4C;
  --line:#23486B;
  --green:#21C55D;
}

* {
  box-sizing:border-box;
}

body {
  margin:0;
  min-height:100vh;
  font-family:Arial,sans-serif;
  background:
    radial-gradient(
      circle at top,
      #12385c 0,
      var(--navy) 55%
    );
  color:var(--white);
}

.container {
  width:min(100% - 28px,520px);
  margin:auto;
  padding-bottom:30px;
}

.center {
  text-align:center;
}

.logo {
  width:105px;
  height:105px;
  display:block;
  object-fit:contain;
  margin:25px auto 8px;
}

h1 {
  margin:8px 0 4px;
}

h2 {
  margin-top:0;
}

.muted {
  color:var(--muted);
  line-height:1.55;
}

.card {
  background:rgba(16,43,76,.96);
  border:1px solid var(--line);
  border-radius:20px;
  padding:20px;
  margin:14px 0;
  box-shadow:0 8px 25px rgba(0,0,0,.18);
}

.btn {
  width:100%;
  padding:15px;
  border-radius:14px;
  font-weight:800;
  font-size:15px;
  border:0;
  margin:8px 0;
  cursor:pointer;
  text-decoration:none;
  display:flex;
  justify-content:center;
  align-items:center;
  text-align:center;
}

.primary {
  background:var(--blue);
  color:#001b2d;
}

.green {
  background:var(--green);
  color:#fff;
}

.secondary {
  background:#193A5C;
  color:#fff;
  border:1px solid #315D82;
}

.danger {
  background:#7f1d1d;
  color:#fff;
}

input {
  width:100%;
  padding:14px;
  margin:7px 0;
  border-radius:12px;
  border:1px solid #3c5f7e;
  background:#0b223d;
  color:#fff;
  font-size:15px;
}

.notice {
  padding:13px;
  border-left:3px solid var(--blue);
  background:#0c2745;
  border-radius:8px;
  line-height:1.5;
  margin:10px 0;
}

.price {
  font-size:28px;
  font-weight:900;
  text-align:center;
  margin:12px 0;
}

.choice {
  border:1px solid #315D82;
  background:#0b223d;
  padding:16px;
  border-radius:15px;
  margin:9px 0;
  cursor:pointer;
}

.choice strong {
  display:block;
  font-size:18px;
  margin-bottom:5px;
}

.choice small {
  color:var(--muted);
}

.choice.selected {
  border-color:var(--blue);
  background:#123B60;
}

.share-box {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}

.hidden {
  display:none !important;
}

.status {
  margin-top:10px;
  color:var(--muted);
  text-align:center;
  min-height:20px;
}

footer {
  text-align:center;
  color:var(--muted);
  font-size:12px;
  margin-top:25px;
}

</style>

</head>

<body>

<main class="container">

<section id="auth">

  <div class="center">

    <div class="logo">
      🌱
    </div>

    <h1>S-Drive</h1>

    <p class="muted">
      Analyse professionnelle de vos matchs
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

    <button
      class="btn primary"
      onclick="login()"
    >
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

    <button
      class="btn primary"
      onclick="register()"
    >
      Créer mon compte
    </button>

  </div>

</section>


<section
  id="dashboard"
  class="${loggedIn ? '' : 'hidden'}"
>

  <div class="center">

    <h1>S-Drive</h1>

    <p class="muted">
      Bienvenue sur votre espace d'analyse.
    </p>

  </div>


  <div class="card">

    <h2>Analyse des matchs</h2>

    <div class="notice">
      Choisissez le type d'analyse que vous souhaitez.
    </div>

    <div
      id="choice2"
      class="choice"
      onclick="selectOdds(2)"
    >

      <strong>Cote 2</strong>

      <small>
        Analyse rapide — environ 2 à 3 minutes
      </small>

    </div>


    <div
      id="choice10"
      class="choice"
      onclick="selectOdds(10)"
    >

      <strong>Cote 10</strong>

      <small>
        Analyse complète — environ 7 à 8 minutes
      </small>

    </div>

    <div class="price">
      1 000 F
    </div>

    <p class="muted center">
      Paiement unique pour l'analyse.
    </p>


    <a
      class="btn green"
      href="${WAVE_URL}"
      target="_blank"
    >
      💳 Payer 1 000 F avec Wave
    </a>


    <button
      class="btn primary"
      onclick="sendMatchScreenshot()"
    >
      📸 Envoyer la capture des matchs
    </button>

    <div
      id="status"
      class="status"
    ></div>

  </div>


  <div class="card">

    <h2>Partager S-Drive</h2>

    <p class="muted">
      Invitez vos amis à découvrir S-Drive.
    </p>

    <div class="share-box">

      <button
        class="btn secondary"
        onclick="copyAppLink()"
      >
        📋 Copier le lien
      </button>

      <button
        class="btn secondary"
        onclick="shareApp()"
      >
        📤 Partager
      </button>

    </div>

    <div
      id="shareStatus"
      class="status"
    ></div>

  </div>


  <div class="card">

    <h2>Conditions d'utilisation</h2>

    <div class="notice">

      <strong>Cote 2</strong><br><br>

      Après paiement et réception de votre capture,
      S-Drive analyse vos matchs de cote 2.

      <br><br>

      Le délai indicatif d'analyse est de
      <strong>2 à 3 minutes</strong>.

      <br><br>

      Si le coupon de cote 2 analysé et envoyé par
      S-Drive est validé après votre pari,
      aucun montant supplémentaire ne vous sera demandé.

      <br><br>

      Si le coupon de cote 2 n'est pas validé,
      vous pouvez réclamer un remboursement de
      <strong>500 F</strong>.

    </div>


    <div class="notice">

      <strong>Cote 10</strong><br><br>

      Le délai indicatif d'analyse est de
      <strong>7 à 8 minutes</strong>.

      <br><br>

      Pour une analyse de cote 10,
      aucun remboursement n'est prévu après le gain
      ou la perte du pari.

    </div>


    <p class="muted">
      Le paiement de l'analyse est de
      <strong>1 000 F</strong>.
    </p>

  </div>


  <button
    class="btn danger"
    onclick="logout()"
  >
    Se déconnecter
  </button>

</section>


<footer>
  S-Drive — Analyse des matchs
</footer>

</main>


<script>

let selectedOdds = 2;

const APP_URL = ${JSON.stringify(APP_URL)};

const WHATSAPP_NUMBER =
  ${JSON.stringify(WHATSAPP_NUMBER)};


/* =========================
   CHOIX COTE
========================= */

function selectOdds(type) {

  selectedOdds = type;

  document
    .getElementById('choice2')
    .classList.remove('selected');

  document
    .getElementById('choice10')
    .classList.remove('selected');

  document
    .getElementById(
      type === 2 ? 'choice2' : 'choice10'
    )
    .classList.add('selected');

}


/* =========================
   INSCRIPTION
========================= */

async function register() {

  const name =
    document.getElementById(
      'registerName'
    ).value.trim();

  const phone =
    document.getElementById(
      'registerPhone'
    ).value.trim();

  const password =
    document.getElementById(
      'registerPassword'
    ).value;

  if (!name || !phone || !password) {

    alert(
      'Veuillez remplir tous les champs.'
    );

    return;
  }

  try {

    const response = await fetch(
      '/api/register',
      {
        method:'POST',

        headers:{
          'Content-Type':
            'application/json'
        },

        body:JSON.stringify({
          name,
          phone,
          password
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      alert(data.error || 'Erreur.');

      return;
    }

    alert(
      data.message ||
      'Compte créé avec succès.'
    );

    document
      .getElementById('auth')
      .classList.add('hidden');

    document
      .getElementById('dashboard')
      .classList.remove('hidden');

  } catch (error) {

    alert(
      'Impossible de contacter le serveur.'
    );

  }

}


/* =========================
   CONNEXION
========================= */

async function login() {

  const phone =
    document.getElementById(
      'loginPhone'
    ).value.trim();

  const password =
    document.getElementById(
      'loginPassword'
    ).value;

  if (!phone || !password) {

    alert(
      'Veuillez remplir tous les champs.'
    );

    return;
  }

  try {

    const response = await fetch(
      '/api/login',
      {
        method:'POST',

        headers:{
          'Content-Type':
            'application/json'
        },

        body:JSON.stringify({
          phone,
          password
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      alert(data.error || 'Erreur.');

      return;
    }

    document
      .getElementById('auth')
      .classList.add('hidden');

    document
      .getElementById('dashboard')
      .classList.remove('hidden');

  } catch (error) {

    alert(
      'Impossible de contacter le serveur.'
    );

  }

}


/* =========================
   ENVOI CAPTURE WHATSAPP
========================= */

async function sendMatchScreenshot() {

  if (!selectedOdds) {

    alert(
      'Choisissez d'abord Cote 2 ou Cote 10.'
    );

    return;
  }

  try {

    await fetch(
      '/api/create-analysis',
      {
        method:'POST',

        headers:{
          'Content-Type':
            'application/json'
        },

        body:JSON.stringify({
          odds_type:selectedOdds
        })
      }
    );

  } catch (error) {

    console.log(error);

  }

  const message =
    selectedOdds === 2
      ? 'Bonjour S-Drive, je viens de payer 1 000 F pour une analyse Cote 2. Voici la capture de mes matchs à analyser. Merci.'
      : 'Bonjour S-Drive, je viens de payer 1 000 F pour une analyse Cote 10. Voici la capture de mes matchs à analyser. Merci.';

  const number =
    String(WHATSAPP_NUMBER)
      .replace(/[^\\d]/g, '');

  if (
    !number ||
    number === 'TON_NUMERO_WHATSAPP'
  ) {

    alert(
      'Le numéro WhatsApp du service doit être configuré.'
    );

    return;
  }

  window.open(
    'https://wa.me/' +
    number +
    '?text=' +
    encodeURIComponent(message),
    '_blank'
  );

}


/* =========================
   COPIER LE LIEN
========================= */

async function copyAppLink() {

  try {

    await navigator.clipboard.writeText(
      APP_URL
    );

    document
      .getElementById('shareStatus')
      .textContent =
      'Lien copié avec succès.';

  } catch (error) {

    prompt(
      'Copiez le lien de S-Drive :',
      APP_URL
    );

  }

}


/* =========================
   PARTAGER
========================= */

async function shareApp() {

  const shareData = {

    title:'S-Drive',

    text:
      'Découvrez S-Drive, l’application d’analyse des matchs.',

    url:APP_URL

  };

  try {

    if (
      navigator.share
    ) {

      await navigator.share(
        shareData
      );

    } else {

      await navigator.clipboard.writeText(
        APP_URL
      );

      document
        .getElementById('shareStatus')
        .textContent =
        'Lien copié. Vous pouvez maintenant le partager.';

    }

  } catch (error) {

    console.log(error);

  }

}


/* =========================
   DECONNEXION
========================= */

async function logout() {

  await fetch(
    '/api/logout',
    {
      method:'POST'
    }
  );

  location.reload();

}

</script>

</body>

</html>
  `);
});


/* =========================
   INSCRIPTION API
========================= */

app.post('/api/register', async (req, res) => {

  try {

    const name =
      String(
        req.body.name || ''
      ).trim();

    const userPhone =
      phone(req.body.phone);

    const password =
      String(
        req.body.password || ''
      );


    if (
      !name ||
      !userPhone ||
      !password
    ) {

      return res.status(400).json({
        error:
          'Tous les champs sont obligatoires.'
      });

    }


    if (password.length < 6) {

      return res.status(400).json({
        error:
          'Le mot de passe doit contenir au moins 6 caractères.'
      });

    }


    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );


    const result =
      db.prepare(`
        INSERT INTO users(
          name,
          phone,
          password_hash
        )
        VALUES (?, ?, ?)
      `).run(
        name,
        userPhone,
        passwordHash
      );


    req.session.userId =
      result.lastInsertRowid;


    res.json({
      message:
        'Compte créé avec succès.'
    });


  } catch (error) {

    if (
      String(error.message)
        .includes('UNIQUE')
    ) {

      return res.status(400).json({
        error:
          'Ce numéro existe déjà.'
      });

    }


    console.error(error);


    res.status(500).json({
      error:
        'Erreur serveur.'
    });

  }

});


/* =========================
   CONNEXION API
========================= */

app.post('/api/login', async (req, res) => {

  try {

    const userPhone =
      phone(req.body.phone);

    const password =
      String(
        req.body.password || ''
      );


    const user =
      db.prepare(`
        SELECT *
        FROM users
        WHERE phone = ?
      `).get(userPhone);


    if (!user) {

      return res.status(401).json({
        error:
          'Numéro ou mot de passe incorrect.'
      });

    }


    const valid =
      await bcrypt.compare(
        password,
        user.password_hash
      );


    if (!valid) {

      return res.status(401).json({
        error:
          'Numéro ou mot de passe incorrect.'
      });

    }


    req.session.userId =
      user.id;


    res.json({
      message:
        'Connexion réussie.'
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      error:
        'Erreur serveur.'
    });

  }

});


/* =========================
   CREATION D'UNE ANALYSE
========================= */

app.post(
  '/api/create-analysis',
  auth,
  (req, res) => {

    const oddsType =
      Number(req.body.odds_type);


    if (
      oddsType !== 2 &&
      oddsType !== 10
    ) {

      return res.status(400).json({
        error:
          'Type de cote invalide.'
      });

    }


    const result =
      db.prepare(`
        INSERT INTO analyses(
          user_id,
          odds_type,
          status
        )
        VALUES (?, ?, 'payment_pending')
      `).run(
        req.session.userId,
        oddsType
      );


    res.json({
      success:true,
      analysisId:
        result.lastInsertRowid
    });

  }
);


/* =========================
   DECONNEXION API
========================= */

app.post(
  '/api/logout',
  (req, res) => {

    req.session.destroy(() => {

      res.json({
        success:true
      });

    });

  }
);


/* =========================
   SERVEUR
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      'S-Drive démarré sur le port ' +
      PORT
    );

  }
);
