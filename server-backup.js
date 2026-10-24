
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_USER || !ADMIN_PASSWORD || !SESSION_SECRET ||
    SESSION_SECRET.length < 32) {
  console.error('Configure ADMIN_USER, ADMIN_PASSWORD e SESSION_SECRET no .env. A chave de sessão deve ter pelo menos 32 caracteres.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(__dirname, { dotfiles: 'deny' }));

app.use(session({
  name: 'bad_admin_session',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: 2 * 60 * 60 * 1000
  }
}));

// Só arquivos públicos do site ficam acessíveis sem login.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function exigirLogin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.status(401).json({ erro: 'Faça login primeiro.' });
}

app.post('/api/login', (req, res, next) => {
  const { usuario, senha } = req.body || {};

  if (typeof usuario !== 'string' || typeof senha !== 'string') {
    return res.status(400).json({ erro: 'Preencha usuário e senha.' });
  }

  if (usuario !== ADMIN_USER || senha !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }

  req.session.regenerate(err => {
    if (err) return next(err);

    req.session.admin = true;
    req.session.save(err => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });
});

app.get('/api/sessao', (req, res) => {
  res.json({ autenticado: req.session?.admin === true });
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('bad_admin_session');
    res.json({ ok: true });
  });
});

app.get('/api/admin', exigirLogin, (req, res) => {
  res.json({ mensagem: 'Login administrativo confirmado.' });
});

app.get('/api/status', (req, res) => {
  res.json({ online: true, site: 'Bad_Dos_Trenzinhos' });
});

const servidor = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Site rodando em http://localhost:${PORT}`);
});

servidor.on('close', () => {
  console.log('O servidor foi encerrado.');
});

servidor.on('error', (erro) => {
  console.error('Erro no servidor:', erro);
});
