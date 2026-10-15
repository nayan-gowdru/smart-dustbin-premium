import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 5000);
const AIO_USERNAME = process.env.AIO_USERNAME;
const AIO_KEY = process.env.AIO_KEY;
const WEB3FORMS_ACCESS_KEY = process.env.WEB3FORMS_ACCESS_KEY;
const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL || '';

const FEEDS = [
  'garbage-distance',
  'garbage-level',
  'garbage-status',
  'hand-distance',
  'lid-status',
  'esp32-status'
];

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAioConfig() {
  if (!AIO_USERNAME || !AIO_KEY) {
    const error = new Error('Adafruit IO credentials are not configured.');
    error.status = 500;
    throw error;
  }
}

async function aioFetch(feedKey, query = '') {
  requireAioConfig();
  const url = `https://io.adafruit.com/api/v2/${encodeURIComponent(AIO_USERNAME)}/feeds/${encodeURIComponent(feedKey)}/data${query}`;
  const response = await fetch(url, {
    headers: {
      'X-AIO-Key': AIO_KEY,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Adafruit IO ${response.status}: ${body.slice(0, 180)}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function getLatest(feedKey) {
  const data = await aioFetch(feedKey, '?limit=1');
  const item = Array.isArray(data) ? data[0] : null;
  return item || { value: null, created_at: null, id: null };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'smart-dustbin-api',
    time: new Date().toISOString(),
    adafruitConfigured: Boolean(AIO_USERNAME && AIO_KEY),
    web3formsConfigured: Boolean(WEB3FORMS_ACCESS_KEY)
  });
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const entries = await Promise.all(
      FEEDS.map(async (feedKey) => [feedKey, await getLatest(feedKey)])
    );

    const feeds = Object.fromEntries(entries);
    res.json({ ok: true, username: AIO_USERNAME, feeds });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

app.get('/api/history/:feedKey', async (req, res) => {
  try {
    const { feedKey } = req.params;
    if (!FEEDS.includes(feedKey)) {
      return res.status(400).json({ ok: false, error: 'Unsupported feed key.' });
    }

    const rawLimit = Number(req.query.limit || 24);
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const data = await aioFetch(feedKey, `?limit=${limit}`);

    const history = Array.isArray(data)
      ? data.map((item) => ({
          value: item.value,
          created_at: item.created_at,
          id: item.id
        }))
      : [];

    res.json({ ok: true, feedKey, history });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

app.post('/api/alert-test', async (req, res) => {
  try {
    if (!WEB3FORMS_ACCESS_KEY) {
      return res.status(500).json({ ok: false, error: 'Web3Forms access key is not configured.' });
    }

    const subject = String(req.body?.subject || 'SMART DUSTBIN • TEST ALERT').slice(0, 120);
    const message = String(req.body?.message || 'Web dashboard test alert.').slice(0, 4000);

    const payload = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject,
      from_name: 'Smart Dustbin Control Center',
      message
    };

    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      return res.status(response.status || 502).json({
        ok: false,
        error: data.message || 'Web3Forms rejected the request.',
        details: data
      });
    }

    res.json({ ok: true, message: 'Test alert submitted to Web3Forms.', data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ ok: false, error: error.message || 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Smart Dustbin server running on http://localhost:${PORT}`);
});
