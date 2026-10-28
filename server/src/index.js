import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initCache } from './cache.js';
import authRoutes from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import adminRoutes from './routes/admin.js';
import shareRoutes, { findShared } from './routes/share.js';
import privateRoutes from './routes/private.js';
import audioRoutes from './routes/audio.js';
import subsRoutes from './routes/subs.js';
import { injectOg } from './utils/og.js';
import { ah } from './utils/ah.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(config.mediaRoot, '.tmp'), { recursive: true });
fs.mkdirSync(path.join(config.mediaRoot, '.thumbs'), { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/share', shareRoutes);   // public, token-based
app.use('/api/private', privateRoutes);   // PIN unlock for private folders
app.use('/api/audio', audioRoutes);       // audio-language tracks
app.use('/api/subs', subsRoutes);         // subtitles (embedded + external files)
app.use('/api', libraryRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Optional: serve the built React app from Node too (when not using nginx for static files)
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  // Shared-link page: same React app, plus title/preview-image tags for chat apps
  app.get('/s/:token', ah(async (req, res) => {
    let html = await fs.promises.readFile(path.join(dist, 'index.html'), 'utf8');
    const v = await findShared(req.params.token, 'title');
    if (v) {
      const base = `${req.protocol}://${req.get('host')}`;
      html = injectOg(html, { title: v.title, url: `${base}/s/${req.params.token}`, image: `${base}/api/share/${req.params.token}/poster` });
    }
    res.set('Cache-Control', 'no-store').type('html').send(html);
  }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status !== 404) console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

await mongoose.connect(config.mongoUri);
console.log('MongoDB connected');
initCache();
app.listen(config.port, () => console.log(`Matinee API on :${config.port}  media: ${config.mediaRoot}`));
