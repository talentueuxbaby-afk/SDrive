const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();

const PORT = Number(
  process.env.PORT || 3000
);

/* =========================================================
   CONFIGURATION
========================================================= */

const APP_URL =
  process.env.APP_URL ||
  'https://TON-LIEN-APPLICATION.com';

const WAVE_URL =
  'https://pay.wave.com/m/M_ci_kpNTVGT9JGah/c/ci/?amount=1000';

const WHATSAPP_NUMBER =
  process.env.WHATSAPP_NUMBER ||
  'TON_NUMERO_WHATSAPP';

/* =========================================================
   BASE DE DONNÉES
========================================================= */

const db = new Database(
  path.join(__dirname, 'sdrive.db')
);

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    odds_type INTEGER NOT NULL
      CHECK(odds_type IN (2, 10)),
    status TEXT NOT NULL
      DEFAULT 'payment_pending',
    created_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(
  express.urlencoded({
    extended: false
  })
);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      'CHANGE-ME-TO-A-LONG-RANDOM-SECRET',

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      sameSite: 'lax',

      secure:
        process.env.NODE_ENV === 'production',

      maxAge:
        7 * 24 * 60 * 60 * 1000
    }
  })
);

/* =========================================================
   UTILITAIRES
========================================================= */

/*
 * Normalisation des numéros ivoiriens.
 *
 * 0700000000
 * devient :
 * 225070000000
 *
 * +225070000000
 * devient :
 * 225070000000
 */

function normalizePhone(value) {

  let p = String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');

  if (!p) {
    return '';
  }

  if (p.startsWith('+225')) {
    return p.substring(1);
  }

  if (p.startsWith('225')) {
    return p;
  }

  if (p.startsWith('0')) {
    return '225' + p.substring(1);
  }

  return p;
}


/*
 * Vérifie la connexion.
 */

function auth(req, res, next) {

  if (!req.session.userId) {

    return res.status(401).json({
      error: 'Connexion requise.'
    });

  }

  next();
}


/*
 * Récupère l'utilisateur connecté.
 */

function getCurrentUser(req) {

  if (!req.session.userId) {
    return null;
  }

  return db
    .prepare(`
      SELECT
        id,
        name,
        phone,
        created_at
      FROM users
      WHERE id = ?
    `)
    .get(req.session.userId);
}


/*
 * Génère le lien WhatsApp.
 */

function whatsappLink(message) {

  const number =
    String(WHATSAPP_NUMBER)
      .replace(/[^\d]/g, '');

  if (
    !number ||
    number === 'TON_NUMERO_WHATSAPP'
  ) {
    return null;
  }

  return (
    'https://wa.me/' +
    number +
    '?text=' +
    encodeURIComponent(message)
  );
}


/*
 * Sécurité HTML.
 */

function escapeHtml(value) {

  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

}


/* =========================================================
   PAGE PRINCIPALE
========================================================= */

app.get('/', (req, res) => {

  const loggedIn =
    Boolean(req.session.userId);

  const currentUser =
    getCurrentUser(req);

  const userName =
    currentUser
      ? escapeHtml(currentUser.name)
      : '';

  res.send(`

<!doctype html>

<html lang="fr">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
>

<meta
  name="theme-color"
  content="#071A2D"
>

<title>
  S-Drive — Analyse des matchs
</title>


<style>

/* =========================================================
   VARIABLES
========================================================= */

:root {

  --navy: #071A2D;

  --navy-2: #0B223D;

  --blue: #00BFFF;

  --white: #FFFFFF;

  --muted: #AFC1D4;

  --card: #102B4C;

  --line: #23486B;

  --green: #21C55D;

  --red: #DC2626;

}


/* =========================================================
   RESET
========================================================= */

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
}

body {

  margin: 0;

  min-height: 100vh;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:
    radial-gradient(
      circle at top,
      #12385C 0%,
      var(--navy) 55%
    );

  color:
    var(--white);
}


/* =========================================================
   CONTENEUR
========================================================= */

.container {

  width:
    min(
      calc(100% - 28px),
      520px
    );

  margin: auto;

  padding:
    15px 0 35px;
}


/* =========================================================
   TEXTE
========================================================= */

.center {
  text-align: center;
}

h1 {

  margin:
    8px 0 4px;

  font-size: 30px;
}

h2 {

  margin:
    0 0 15px;

  font-size: 21px;
}

h3 {

  margin-top: 0;
}

.muted {

  color:
    var(--muted);

  line-height:
    1.55;
}


/* =========================================================
   LOGO
========================================================= */

.logo {

  width:
    105px;

  height:
    105px;

  margin:
    20px auto 5px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  font-size:
    75px;
}


/* =========================================================
   CARTES
========================================================= */

.card {

  background:
    rgba(16, 43, 76, 0.96);

  border:
    1px solid var(--line);

  border-radius:
    20px;

  padding:
    20px;

  margin:
    14px 0;

  box-shadow:
    0 8px 25px rgba(0,0,0,.18);
}


/* =========================================================
   INPUTS
========================================================= */

input {

  width:
    100%;

  padding:
    14px;

  margin:
    7px 0;

  border-radius:
    12px;

  border:
    1px solid #3C5F7E;

  background:
    var(--navy-2);

  color:
    var(--white);

  font-size:
    15px;

  outline:
    none;
}

input:focus {

  border-color:
    var(--blue);
}


/* =========================================================
   BOUTONS
========================================================= */

.btn {

  width:
    100%;

  padding:
    15px;

  border-radius:
    14px;

  font-weight:
    800;

  font-size:
    15px;

  border:
    0;

  margin:
    8px 0;

  cursor:
    pointer;

  text-decoration:
    none;

  display:
    flex;

  justify-content:
    center;

  align-items:
    center;

  text-align:
    center;

  transition:
    transform .15s ease,
    opacity .15s ease;
}

.btn:active {

  transform:
    scale(.98);
}

.primary {

  background:
    var(--blue);

  color:
    #001B2D;
}

.green {

  background:
    var(--green);

  color:
    #FFFFFF;
}

.secondary {

  background:
    #193A5C;

  color:
    #FFFFFF;

  border:
    1px solid #315D82;
}

.danger {

  background:
    var(--red);

  color:
    #FFFFFF;
}


/* =========================================================
   CHOIX COTES
========================================================= */

.choice {

  border:
    1px solid #315D82;

  background:
    #0B223D;

  padding:
    16px;

  border-radius:
    15px;

  margin:
    9px 0;

  cursor:
    pointer;

  transition:
    .2s ease;
}

.choice strong {

  display:
    block;

  font-size:
    18px;

  margin-bottom:
    5px;
}

.choice small {

  color:
    var(--muted);
}

.choice.selected {

  border-color:
    var(--blue);

  background:
    #123B60;

  transform:
    scale(1.01);
}


/* =========================================================
   PRIX
========================================================= */

.price {

  font-size:
    28px;

  font-weight:
    900;

  text-align:
    center;

  margin:
    15px 0;
}


/* =========================================================
   NOTICES
========================================================= */

.notice {

  padding:
    13px;

  border-left:
    3px solid var(--blue);

  background:
    #0C2745;

  border-radius:
    8px;

  line-height:
    1.5;

  margin:
    10px 0;
}


/* =========================================================
   STATUT
========================================================= */

.status {

  margin-top:
    10px;

  color:
    var(--muted);

  text-align:
    center;

  min-height:
    20px;
}


/* =========================================================
   PARTAGE
========================================================= */

.share-box {

  display:
    grid;

  grid-template-columns:
    1fr 1fr;

  gap:
    8px;
}


/* =========================================================
   UTILISATEUR
========================================================= */

.user-box {

  background:
    rgba(7,26,45,.65);

  border:
    1px solid var(--line);

  padding:
    13px;

  border-radius:
    14px;

  margin-bottom:
    15px;

  text-align:
    center;
}


/* =========================================================
   HIDDEN
========================================================= */

.hidden {

  display:
    none !important;
}


/* =========================================================
   FOOTER
========================================================= */

footer {

  text-align:
    center;

  color:
    var(--muted);

  font-size:
    12px;

  margin-top:
    25px;
}


/* =========================================================
   MOBILE
========================================================= */

@media (max-width: 360px) {

  .container {

    width:
      calc(100% - 20px);
  }

  h1 {

    font-size:
      27px;
  }

  .card {

    padding:
      16px;
  }

}

</style>

</head>


<body>


<main class="container">


<!-- ======================================================
     AUTHENTIFICATION
====================================================== -->

<section
  id="auth"
  class="${loggedIn ? 'hidden' : ''}"
>


  <div class="center">

    <div class="logo">
      🌱
    </div>

    <h1>
      S-Drive
    </h1>

    <p class="muted">
      Analyse professionnelle
      de vos matchs
    </p>

  </div>


  <!-- ====================================================
       CONNEXION
  ===================================================== -->

  <div class="card">

    <h2>
      Connexion
    </h2>

    <input
      id="loginPhone"
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      placeholder="Numéro de téléphone"
    >

    <input
      id="loginPassword"
      type="password"
      autocomplete="current-password"
      placeholder="Mot de passe"
    >

    <button
      class="btn primary"
      onclick="login()"
    >
      Se connecter
    </button>

  </div>


  <!-- ====================================================
       INSCRIPTION
  ===================================================== -->

  <div class="card">

    <h2>
      Créer un compte
    </h2>

    <input
      id="registerName"
      type="text"
      autocomplete="name"
      placeholder="Nom"
    >

    <input
      id="registerPhone"
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      placeholder="Numéro de téléphone"
    >

    <input
      id="registerPassword"
      type="password"
      autocomplete="new-password"
      placeholder="Mot de passe — 6 caractères minimum"
    >

    <button
      class="btn primary"
      onclick="register()"
    >
      Créer mon compte
    </button>

  </div>

</section>


<!-- ======================================================
     TABLEAU DE BORD
====================================================== -->

<section
  id="dashboard"
  class="${loggedIn ? '' : 'hidden'}"
>


  <div class="center">

    <div class="logo">
      🌱
    </div>

    <h1>
      S-Drive
    </h1>

    <p class="muted">

      Bienvenue
      ${userName
        ? ' ' + userName
        : ''}

    </p>

  </div>


  <!-- ====================================================
       ANALYSE
  ===================================================== -->

  <div class="card">

    <h2>
      Analyse des matchs
    </h2>


    <div class="notice">

      Choisissez le type d'analyse
      que vous souhaitez.

    </div>


    <!-- COTE 2 -->

    <div
      id="choice2"
      class="choice selected"
      onclick="selectOdds(2)"
    >

      <strong>
        Cote 2
      </strong>

      <small>
        Analyse rapide —
        environ 2 à 3 minutes
      </small>

    </div>


    <!-- COTE 10 -->

    <div
      id="choice10"
      class="choice"
      onclick="selectOdds(10)"
    >

      <strong>
        Cote 10
      </strong>

      <small>
        Analyse complète —
        environ 7 à 8 minutes
      </small>

    </div>


    <div class="price">
      1 000 F
    </div>


    <p class="muted center">
      Paiement unique pour l'analyse.
    </p>


    <!-- PAIEMENT WAVE -->

    <a
      class="btn green"
      href="${WAVE_URL}"
      target="_blank"
      rel="noopener noreferrer"
    >
      💳 Payer 1 000 F avec Wave
    </a>


    <!-- WHATSAPP -->

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


  <!-- ====================================================
       PARTAGE
  ===================================================== -->

  <div class="card">

    <h2>
      Partager S-Drive
    </h2>

    <p class="muted">

      Invitez vos amis à découvrir
      S-Drive.

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


  <!-- ====================================================
       CONDITIONS
  ===================================================== -->

  <div class="card">

    <h2>
      Conditions d'utilisation
    </h2>


    <div class="notice">

      <strong>
        Cote 2
      </strong>

      <br><br>

      Après paiement et réception
      de votre capture, S-Drive analyse
      vos matchs de cote 2.

      <br><br>

      Le délai indicatif d'analyse est de
      <strong>
        2 à 3 minutes
      </strong>.

      <br><br>

      Si le coupon de cote 2 analysé
      et envoyé par S-Drive est validé
      après votre pari, aucun montant
      supplémentaire ne vous sera demandé.

      <br><br>

      Si le coupon de cote 2 n'est pas
      validé, vous pouvez réclamer un
      remboursement de
      <strong>
        500 F
      </strong>.

    </div>


    <div class="notice">

      <strong>
        Cote 10
      </strong>

      <br><br>

      Le délai indicatif d'analyse est de
      <strong>
        7 à 8 minutes
      </strong>.

      <br><br>

      Pour une analyse de cote 10,
      aucun remboursement n'est prévu
      après le gain ou la perte du pari.

    </div>


    <p class="muted">

      Le paiement de l'analyse est de
      <strong>
        1 000 F
      </strong>.

    </p>

  </div>


  <!-- ====================================================
       DECONNEXION
  ===================================================== -->

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

/* =========================================================
   CONFIGURATION
========================================================= */

let selectedOdds = 2;

const APP_URL =
  ${JSON.stringify(APP_URL)};

const WHATSAPP_NUMBER =
  ${JSON.stringify(WHATSAPP_NUMBER)};


/* =========================================================
   CHOIX DE LA COTE
========================================================= */

function selectOdds(type) {

  if (
    type !== 2 &&
    type !== 10
  ) {
    return;
  }

  selectedOdds = type;


  const choice2 =
    document.getElementById(
      'choice2'
    );

  const choice10 =
    document.getElementById(
      'choice10'
    );


  choice2.classList.remove(
    'selected'
  );

  choice10.classList.remove(
    'selected'
  );


  if (type === 2) {

    choice2.classList.add(
      'selected'
    );

  } else {

    choice10.classList.add(
      'selected'
    );

  }

}


/* =========================================================
   INSCRIPTION
========================================================= */

async function register() {

  const name =
    document
      .getElementById('registerName')
      .value
      .trim();


  const userPhone =
    document
      .getElementById('registerPhone')
      .value
      .trim();


  const password =
    document
      .getElementById('registerPassword')
      .value;


  if (
    !name ||
    !userPhone ||
    !password
  ) {

    alert(
      'Veuillez remplir tous les champs.'
    );

    return;
  }


  if (
    password.length < 6
  ) {

    alert(
      'Le mot de passe doit contenir au moins 6 caractères.'
    );

    return;
  }


  try {

    const response =
      await fetch(
        '/api/register',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            name,
            phone: userPhone,
            password
          })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Erreur lors de l'inscription.'
      );

      return;
    }


    alert(
      data.message ||
      'Compte créé avec succès.'
    );


    document
      .getElementById('auth')
      .classList.add(
        'hidden'
      );


    document
      .getElementById('dashboard')
      .classList.remove(
        'hidden'
      );

  } catch (error) {

    console.error(error);

    alert(
      'Impossible de contacter le serveur.'
    );

  }

}


/* =========================================================
   CONNEXION
========================================================= */

async function login() {

  const userPhone =
    document
      .getElementById('loginPhone')
      .value
      .trim();


  const password =
    document
      .getElementById('loginPassword')
      .value;


  if (
    !userPhone ||
    !password
  ) {

    alert(
      'Veuillez remplir tous les champs.'
    );

    return;
  }


  try {

    const response =
      await fetch(
        '/api/login',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            phone: userPhone,
            password
          })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Numéro ou mot de passe incorrect.'
      );

      return;
    }


    document
      .getElementById('auth')
      .classList.add(
        'hidden'
      );


    document
      .getElementById('dashboard')
      .classList.remove(
        'hidden'
      );

  } catch (error) {

    console.error(error);

    alert(
      'Impossible de contacter le serveur.'
    );

  }

}


/* =========================================================
   ENVOYER LA CAPTURE SUR WHATSAPP
========================================================= */

async function sendMatchScreenshot() {

  if (
    selectedOdds !== 2 &&
    selectedOdds !== 10
  ) {

    alert(
      'Choisissez Cote 2 ou Cote 10.'
    );

    return;
  }


  const status =
    document.getElementById(
      'status'
    );


  status.textContent =
    'Préparation de votre demande...';


  try {

    const response =
      await fetch(
        '/api/create-analysis',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            odds_type:
              selectedOdds
          })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      if (
        response.status === 401
      ) {

        alert(
          'Votre session a expiré. Veuillez vous reconnecter.'
        );

        location.reload();

        return;
      }


      alert(
        data.error ||
        'Impossible de créer la demande.'
      );

      status.textContent =
        '';

      return;
    }


    const message =
      selectedOdds === 2

        ? 'Bonjour S-Drive, je viens de payer 1 000 F pour une analyse Cote 2. Voici la capture de mes matchs à analyser. Merci.'

        : 'Bonjour S-Drive, je viens de payer 1 000 F pour une analyse Cote 10. Voici la capture de mes matchs à analyser. Merci.';


    const link =
      whatsappLink(message);


    if (!link) {

      status.textContent =
        'Le numéro WhatsApp du service doit être configuré.';

      return;
    }


    status.textContent =
      'Ouverture de WhatsApp...';


    window.open(
      link,
      '_blank'
    );


  } catch (error) {

    console.error(error);

    status.textContent =
      'Impossible de contacter le serveur.';

  }

}


/* =========================================================
   COPIER LE LIEN
========================================================= */

async function copyAppLink() {

  const status =
    document.getElementById(
      'shareStatus'
    );


  try {

    await navigator
      .clipboard
      .writeText(
        APP_URL
      );


    status.textContent =
      'Lien copié avec succès.';


  } catch (error) {

    prompt(
      'Copiez le lien de S-Drive :',
      APP_URL
    );

  }

}


/* =========================================================
   PARTAGER
========================================================= */

async function shareApp() {

  const shareData = {

    title:
      'S-Drive',

    text:
      'Découvrez S-Drive, l’application d’analyse des matchs.',

    url:
      APP_URL

  };


  try {

    if (
      navigator.share
    ) {

      await navigator.share(
        shareData
      );

    } else {

      await navigator
        .clipboard
        .writeText(
          APP_URL
        );


      document
        .getElementById(
          'shareStatus'
        )
        .textContent =
        'Lien copié. Vous pouvez maintenant le partager.';

    }

  } catch (error) {

    console.log(error);

  }

}


/* =========================================================
   DECONNEXION
========================================================= */

async function logout() {

  try {

    await fetch(
      '/api/logout',
      {
        method: 'POST'
      }
    );

  } catch (error) {

    console.error(error);

  }


  location.reload();

}

</script>

</body>

</html>

  `);

});


/* =========================================================
   API — INSCRIPTION
========================================================= */

app.post(
  '/api/register',
  async (req, res) => {

    try {

      const name =
        String(
          req.body.name || ''
        ).trim();


      const userPhone =
        normalizePhone(
          req.body.phone
        );


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


      if (
        password.length < 6
      ) {

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
        db
          .prepare(`
            INSERT INTO users (
              name,
              phone,
              password_hash
            )
            VALUES (?, ?, ?)
          `)
          .run(
            name,
            userPhone,
            passwordHash
          );


      req.session.userId =
        result.lastInsertRowid;


      return res.json({

        success: true,

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


      console.error(
        'Erreur inscription:',
        error
      );


      return res.status(500).json({

        error:
          'Erreur serveur.'

      });

    }

  }
);


/* =========================================================
   API — CONNEXION
========================================================= */

app.post(
  '/api/login',
  async (req, res) => {

    try {

      const userPhone =
        normalizePhone(
          req.body.phone
        );


      const password =
        String(
          req.body.password || ''
        );


      if (
        !userPhone ||
        !password
      ) {

        return res.status(400).json({

          error:
            'Veuillez remplir tous les champs.'

        });

      }


      const user =
        db
          .prepare(`
            SELECT *
            FROM users
            WHERE phone = ?
          `)
          .get(
            userPhone
          );


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


      return res.json({

        success: true,

        message:
          'Connexion réussie.'

      });


    } catch (error) {

      console.error(
        'Erreur connexion:',
        error
      );


      return res.status(500).json({

        error:
          'Erreur serveur.'

      });

    }

  }
);


/* =========================================================
   API — UTILISATEUR CONNECTÉ
========================================================= */

app.get(
  '/api/me',
  auth,
  (req, res) => {

    const user =
      getCurrentUser(req);


    if (!user) {

      return res.status(404).json({

        error:
          'Utilisateur introuvable.'

      });

    }


    return res.json({

      success: true,

      user

    });

  }
);


/* =========================================================
   API — CRÉATION D'UNE ANALYSE
========================================================= */

app.post(
  '/api/create-analysis',
  auth,
  (req, res) => {

    try {

      const oddsType =
        Number(
          req.body.odds_type
        );


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
        db
          .prepare(`
            INSERT INTO analyses (
              user_id,
              odds_type,
              status
            )
            VALUES (
              ?,
              ?,
              'payment_pending'
            )
          `)
          .run(
            req.session.userId,
            oddsType
          );


      return res.json({

        success: true,

        analysisId:
          result.lastInsertRowid,

        oddsType

      });


    } catch (error) {

      console.error(
        'Erreur création analyse:',
        error
      );


      return res.status(500).json({

        error:
          'Impossible de créer la demande d’analyse.'

      });

    }

  }
);


/* =========================================================
   API — LISTE DES ANALYSES DE L'UTILISATEUR
========================================================= */

app.get(
  '/api/analyses',
  auth,
  (req, res) => {

    try {

      const analyses =
        db
          .prepare(`
            SELECT
              id,
              odds_type,
              status,
              created_at
            FROM analyses
            WHERE user_id = ?
            ORDER BY id DESC
          `)
          .all(
            req.session.userId
          );


      return res.json({

        success: true,

        analyses

      });


    } catch (error) {

      console.error(
        'Erreur récupération analyses:',
        error
      );


      return res.status(500).json({

        error:
          'Erreur serveur.'

      });

    }

  }
);


/* =========================================================
   API — DÉCONNEXION
========================================================= */

app.post(
  '/api/logout',
  (req, res) => {

    req.session.destroy(
      (error) => {

        if (error) {

          console.error(
            'Erreur déconnexion:',
            error
          );

          return res.status(500).json({

            error:
              'Impossible de se déconnecter.'

          });

        }


        res.clearCookie(
          'connect.sid'
        );


        return res.json({

          success: true

        });

      }
    );

  }
);


/* =========================================================
   GESTION DES ERREURS
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      'Erreur serveur:',
      error
    );


    if (
      res.headersSent
    ) {

      return next(error);

    }


    return res.status(500).json({

      error:
        'Erreur interne du serveur.'

    });

  }
);


/* =========================================================
   SERVEUR
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      'S-Drive démarré sur le port ' +
      PORT
    );

  }
);
