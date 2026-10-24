
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./database');

const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor);
const PORT = 3000;
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (
  !ADMIN_USER ||
  !ADMIN_PASSWORD ||
  !SESSION_SECRET ||
  SESSION_SECRET.length < 32
) {
  console.error('Confira ADMIN_USER, ADMIN_PASSWORD e SESSION_SECRET no .env.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

io.on('connection', socket => {
  console.log('Página conectada à sincronização:', socket.id);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 2
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (file.fieldname === 'imagem') {
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        return cb(new Error('A imagem precisa ser JPG, PNG ou WEBP.'));
      }
    }

    if (file.fieldname === 'arquivo') {
      if (!['.zip', '.rar', '.7z'].includes(ext)) {
        return cb(new Error('O mod precisa ser ZIP, RAR ou 7Z.'));
      }
    }

    cb(null, true);
  }
});

function exigirLogin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.status(401).json({ erro: 'Faça login primeiro.' });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/painel.html', exigirLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'painel.html'));
});

app.get('/api/mods', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const mods = db.prepare('SELECT * FROM mods ORDER BY id DESC').all();
    res.json(mods);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao listar os mods.' });
  }
});

app.post(
  '/api/mods',
  exigirLogin,
  upload.fields([
    { name: 'imagem', maxCount: 1 },
    { name: 'arquivo', maxCount: 1 }
  ]),
  (req, res) => {
    try {
      const { nome, descricao, categoria } = req.body;
      const imagem = req.files?.imagem?.[0];
      const arquivo = req.files?.arquivo?.[0];

      if (
        typeof nome !== 'string' || !nome.trim() ||
        typeof descricao !== 'string' || !descricao.trim() ||
        typeof categoria !== 'string' || !categoria.trim() ||
        !imagem || !arquivo
      ) {
        return res.status(400).json({
          erro: 'Preencha nome, descrição, categoria, imagem e arquivo.'
        });
      }

      const categoriasPermitidas = ['Carretas', 'Barcos', 'Mapas', 'Skins'];

      if (!categoriasPermitidas.includes(categoria.trim())) {
        return res.status(400).json({ erro: 'Categoria inválida.' });
      }

      const resultado = db.prepare(`
        INSERT INTO mods (name, description, category, image, download)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        nome.trim(),
        descricao.trim(),
        categoria.trim(),
        '/uploads/' + imagem.filename,
        '/uploads/' + arquivo.filename
      );

      // Avisa todas as páginas conectadas para atualizarem a lista.
      io.emit('mods:updated');

      res.status(201).json({
        ok: true,
        id: resultado.lastInsertRowid,
        mensagem: 'Mod cadastrado com sucesso!'
      });
    } catch (erro) {
      console.error(erro);
      res.status(500).json({ erro: 'Erro ao cadastrar o mod.' });
    }
  }
);

app.delete('/api/mods/:id', exigirLogin, (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'ID inválido.' });
    }

    const mod = db.prepare('SELECT id FROM mods WHERE id = ?').get(id);

    if (!mod) {
      return res.status(404).json({ erro: 'Veículo/mod não encontrado.' });
    }

    db.prepare('DELETE FROM mods WHERE id = ?').run(id);

    // Avisa o catálogo e o painel.
    io.emit('mods:updated');

    res.json({
      ok: true,
      mensagem: 'Veículo/mod excluído do site com sucesso!'
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir o veículo/mod.' });
  }
});

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

app.use('/uploads', express.static(uploadDir));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      erro: 'Falha no upload. Confira os limites dos arquivos.'
    });
  }

  if (err) {
    console.error(err);
    return res.status(400).json({
      erro: err.message || 'Erro ao processar a solicitação.'
    });
  }

  next();
});

servidor.listen(PORT, '127.0.0.1', () => {
  console.log(`Site rodando em http://localhost:${PORT}`);
});

servidor.on('error', erro => {
  console.error('Erro no servidor:', erro);
});
