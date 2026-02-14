// Siesta Sync Server — bridges Chrome extension to filesystem
// Zero dependencies, runs on localhost:7749

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 7749;
const SIESTA_DIR = path.join(require("os").homedir(), ".siesta");
const VOCAB_PATH = path.join(SIESTA_DIR, "vocabulary.json");
const CONFIG_PATH = path.join(SIESTA_DIR, "config.json");

function ensureDir() {
  if (!fs.existsSync(SIESTA_DIR)) {
    fs.mkdirSync(SIESTA_DIR, { recursive: true });
  }
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function writeJSON(filePath, data) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // ─── Vocabulary ───
    if (url.pathname === "/api/vocabulary" && req.method === "GET") {
      const vocab = readJSON(VOCAB_PATH);
      const language = url.searchParams.get("language");
      if (language) {
        json(res, 200, { [language]: vocab[language] || {} });
      } else {
        json(res, 200, vocab);
      }
      return;
    }

    if (url.pathname === "/api/vocabulary" && req.method === "POST") {
      const body = await readBody(req);
      const { language, word, translation, pronunciation, stage, seenCount, lastSeen } = body;

      if (!language || !word) {
        json(res, 400, { error: "language and word are required" });
        return;
      }

      const vocab = readJSON(VOCAB_PATH);
      if (!vocab[language]) vocab[language] = {};

      const existing = vocab[language][word] || {};
      vocab[language][word] = {
        stage: stage || existing.stage || "exposed",
        seenCount: Math.max(seenCount || 0, existing.seenCount || 0),
        lastSeen: Math.max(lastSeen || 0, existing.lastSeen || 0),
        translation: translation || existing.translation || "",
        pronunciation: pronunciation || existing.pronunciation || "",
      };

      writeJSON(VOCAB_PATH, vocab);
      json(res, 200, { ok: true });
      return;
    }

    // ─── Config ───
    if (url.pathname === "/api/config" && req.method === "GET") {
      json(res, 200, readJSON(CONFIG_PATH));
      return;
    }

    if (url.pathname === "/api/config" && req.method === "POST") {
      const body = await readBody(req);
      const config = readJSON(CONFIG_PATH);
      Object.assign(config, body);
      writeJSON(CONFIG_PATH, config);
      json(res, 200, { ok: true });
      return;
    }

    // ─── Health check ───
    if (url.pathname === "/api/health") {
      json(res, 200, { status: "ok", app: "siesta-sync" });
      return;
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Siesta sync server running on http://127.0.0.1:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
