const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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

const upload = multer({ dest: IMAGES_DIR });

app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f));
    res.json(files.map(f => ({ filename: f, url: '/data/images/' + f })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/images', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filename: req.file.filename, url: '/data/images/' + req.file.filename });
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

app.use(express.static(__dirname));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// ── Helpers ───────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

app.listen(PORT, () => {
  console.log(`Crucible rulebook server → http://localhost:${PORT}`);
});
