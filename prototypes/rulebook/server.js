const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

const DATA_DIR = path.join(__dirname, 'data');
const ENTRIES_DIR = path.join(DATA_DIR, 'entries');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

[DATA_DIR, ENTRIES_DIR, IMAGES_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json({ limit: '5mb' }));
app.use(express.text({ limit: '5mb' }));

// ── Layout API ────────────────────────────────────────────

app.get('/api/layout', (req, res) => {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, 'layout.json'), 'utf8');
    res.json(JSON.parse(data));
   } catch { res.json({ title: 'Untitled', chapters: [] }); }
});

app.put('/api/layout', (req, res) => {
  try {
    fs.writeFileSync(path.join(DATA_DIR, 'layout.json'), JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Appendix API ──────────────────────────────────────────

app.get('/api/appendix', (req, res) => {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, 'appendix.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch { res.json({ terms: [] }); }
});

app.put('/api/appendix', (req, res) => {
  try {
    fs.writeFileSync(path.join(DATA_DIR, 'appendix.json'), JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Entries API ───────────────────────────────────────────

app.get('/api/entries', (req, res) => {
  try {
    const files = fs.readdirSync(ENTRIES_DIR)
      .filter(f => f.endsWith('.html'))
      .map(f => ({ id: f.replace(/\.html$/, ''), file: f }));
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/entries/:id', (req, res) => {
  const filePath = path.join(ENTRIES_DIR, req.params.id + '.html');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  try {
    res.type('text/html').send(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/entries/:id', (req, res) => {
  const filePath = path.join(ENTRIES_DIR, req.params.id + '.html');
  const content = typeof req.body === 'string' ? req.body : req.body?.content || '';
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/entries/:id', (req, res) => {
  const filePath = path.join(ENTRIES_DIR, req.params.id + '.html');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  try {
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entries', (req, res) => {
  const { id, title, empty } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const filePath = path.join(ENTRIES_DIR, id + '.html');
  if (fs.existsSync(filePath)) return res.status(409).json({ error: 'Entry already exists' });
  const content = empty
    ? `<p><br></p>\n`
    : `<h2>${escapeHtml(title || id)}</h2>\n<p>Start writing here...</p>\n`;
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Images API ────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = (file.originalname.replace(/\.[^.]+$/, '') || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, (base ? base + '-' : '') + unique + ext);
  }
});

const upload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG and PNG files are allowed.'));
  }
});

app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(png|jpe?g)$/i.test(f));
    res.json(files.map(f => ({ filename: f, url: '/data/images/' + f })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function findDuplicate(hash, excludeName) {
  for (const f of fs.readdirSync(IMAGES_DIR)) {
    if (f === excludeName) continue;
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    try {
      if (hashBuffer(fs.readFileSync(path.join(IMAGES_DIR, f))) === hash) return f;
    } catch { /* skip unreadable file */ }
  }
  return null;
}

function desiredName(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  let base = (originalname.replace(/\.[^.]+$/, '') || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) base = 'image';
  return base + ext;
}

function resolveName(desired, excludeName) {
  const target = path.join(IMAGES_DIR, desired);
  if (desired === excludeName || !fs.existsSync(target)) return desired;
  const ext = path.extname(desired);
  const stem = desired.slice(0, -ext.length);
  let i = 2, cand;
  do { cand = stem + '-' + i + ext; i++; }
  while (fs.existsSync(path.join(IMAGES_DIR, cand)));
  return cand;
}

app.post('/api/images', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const buf = fs.readFileSync(req.file.path);
    const hash = hashBuffer(buf);
    const duplicate = findDuplicate(hash, req.file.filename);

    if (duplicate) {
      // Same image already exists — discard the re-upload and rename the
      // existing copy to the name the user supplied.
      fs.unlinkSync(req.file.path);
      const finalName = resolveName(desiredName(req.file.originalname), duplicate);
      if (finalName !== duplicate) {
        fs.renameSync(path.join(IMAGES_DIR, duplicate), path.join(IMAGES_DIR, finalName));
      }
      return res.json({
        filename: finalName,
        url: '/data/images/' + finalName,
        duplicate: true,
        previousName: duplicate
      });
    }

    const finalName = resolveName(desiredName(req.file.originalname), null);
    fs.renameSync(req.file.path, path.join(IMAGES_DIR, finalName));
    return res.json({
      filename: finalName,
      url: '/data/images/' + finalName,
      duplicate: false
    });
  } catch (e) {
    try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/images/:filename', (req, res) => {
  const filePath = path.join(IMAGES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  try {
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Static files (after API routes) ──────────────────────

// No-cache JS/CSS/HTML during development so the browser never serves a
// stale bundle (e.g. an older edit-mode.js or entries.css that predates a
// feature change). node_modules is left cacheable (large, stable deps).
function noCacheAssets(res, filePath) {
  if (/\.(js|css|html?)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
}

app.use(express.static(__dirname, { setHeaders: noCacheAssets }));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), { setHeaders: noCacheAssets }));

// ── Helpers ───────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Error handler (multer rejections land here) ──────────

app.use((err, req, res, next) => {
  if (!err) return next();
  res.status(400).json({ error: err.message || 'Upload failed' });
});

app.listen(PORT, () => {
  console.log(`Crucible rulebook server → http://localhost:${PORT}`);
});
