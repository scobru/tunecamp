import http from 'http';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Tunecamp } from '../index.js';
import { createSlug } from '../utils/fileUtils.js';
import { validateCatalogConfig, validateReleaseConfig } from '../utils/configUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StudioServerOptions = {
  inputDir: string;
  port?: number;
};

type JsonValue = Record<string, any>;

const DEFAULT_PORT = 4848;

function resolveStudioUiDir(): string | null {
  const distDir = path.resolve(__dirname, '../../studio/dist');
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return distDir;
  }
  return null;
}

function getPreviewDir(inputDir: string): string {
  return path.join(inputDir, '.tunecamp-preview');
}

async function readYamlFile(filePath: string): Promise<{ data: JsonValue; raw: string } | null> {
  if (!(await fs.pathExists(filePath))) {
    return null;
  }
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = parseYaml(raw) as JsonValue;
  return { data, raw };
}

async function writeYamlFile(filePath: string, data: JsonValue): Promise<void> {
  const raw = stringifyYaml(data, { lineWidth: 0 });
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, raw, 'utf-8');
}

function sendJson(res: http.ServerResponse, status: number, body: JsonValue): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function sendText(res: http.ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

async function parseJsonBody(req: http.IncomingMessage): Promise<JsonValue> {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = data ? JSON.parse(data) : {};
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function serveStaticFile(res: http.ServerResponse, filePath: string): Promise<void> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.map': 'application/json',
    };
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

async function listThemes(): Promise<string[]> {
  const templatesDir = path.resolve(__dirname, '../../templates');
  if (!(await fs.pathExists(templatesDir))) {
    return [];
  }
  const entries = await fs.readdir(templatesDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export async function startStudioServer(options: StudioServerOptions): Promise<{ server: http.Server; port: number }> {
  const inputDir = path.resolve(options.inputDir);
  const port = options.port ?? DEFAULT_PORT;
  const previewDir = getPreviewDir(inputDir);
  const studioUiDir = resolveStudioUiDir();
  let isBuildingPreview = false;

  const server = http.createServer(async (req, res) => {
    const reqUrl = req.url ?? '/';
    const parsedUrl = new URL(reqUrl, `http://${req.headers.host ?? 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    try {
      if (pathname.startsWith('/api/status') && req.method === 'GET') {
        const themes = await listThemes();
        sendJson(res, 200, { inputDir, previewDir, themes });
        return;
      }

      if (pathname === '/api/catalog') {
        const filePath = path.join(inputDir, 'catalog.yaml');
        if (req.method === 'GET') {
          const result = await readYamlFile(filePath);
          sendJson(res, 200, { data: result?.data ?? null, raw: result?.raw ?? '' });
          return;
        }
        if (req.method === 'PUT') {
          const body = await parseJsonBody(req);
          const data = body.data ?? {};
          try {
            validateCatalogConfig(data);
          } catch (error: any) {
            sendJson(res, 400, { error: error?.message ?? 'Catalogo non valido' });
            return;
          }
          await writeYamlFile(filePath, data);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      if (pathname === '/api/artist') {
        const filePath = path.join(inputDir, 'artist.yaml');
        if (req.method === 'GET') {
          const result = await readYamlFile(filePath);
          sendJson(res, 200, { data: result?.data ?? null, raw: result?.raw ?? '' });
          return;
        }
        if (req.method === 'PUT') {
          const body = await parseJsonBody(req);
          const data = body.data ?? {};
          await writeYamlFile(filePath, data);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      if (pathname === '/api/releases' && req.method === 'GET') {
        const releasesDir = path.join(inputDir, 'releases');
        const releases: JsonValue[] = [];
        if (await fs.pathExists(releasesDir)) {
          const entries = await fs.readdir(releasesDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const releaseId = entry.name;
            const filePath = path.join(releasesDir, releaseId, 'release.yaml');
            const result = await readYamlFile(filePath);
            releases.push({ id: releaseId, data: result?.data ?? null, raw: result?.raw ?? '' });
          }
        }
        sendJson(res, 200, { releases });
        return;
      }

      if (pathname === '/api/releases' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const data = body.data ?? {};
        try {
          validateReleaseConfig(data);
        } catch (error: any) {
          sendJson(res, 400, { error: error?.message ?? 'Release non valida' });
          return;
        }
        const releaseId = body.id ?? createSlug(data.title ?? 'release');
        const releaseDir = path.join(inputDir, 'releases', releaseId);
        const filePath = path.join(releaseDir, 'release.yaml');
        await writeYamlFile(filePath, data);
        sendJson(res, 200, { ok: true, id: releaseId });
        return;
      }

      if (pathname.startsWith('/api/releases/') && req.method === 'PUT') {
        const releaseId = pathname.replace('/api/releases/', '');
        if (!releaseId) {
          sendJson(res, 400, { error: 'Release id missing' });
          return;
        }
        const body = await parseJsonBody(req);
        const data = body.data ?? {};
        try {
          validateReleaseConfig(data);
        } catch (error: any) {
          sendJson(res, 400, { error: error?.message ?? 'Release non valida' });
          return;
        }
        const filePath = path.join(inputDir, 'releases', releaseId, 'release.yaml');
        await writeYamlFile(filePath, data);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/preview' && req.method === 'POST') {
        if (isBuildingPreview) {
          sendJson(res, 409, { error: 'Preview build already running' });
          return;
        }
        isBuildingPreview = true;
        const body = await parseJsonBody(req);
        const theme = body.theme;
        const basePath = body.basePath ?? '/preview';
        const generator = new Tunecamp({
          inputDir,
          outputDir: previewDir,
          theme,
          basePath,
          verbose: false,
        });
        try {
          await generator.build();
          sendJson(res, 200, { ok: true });
        } catch (error: any) {
          sendJson(res, 500, { error: error?.message ?? 'Preview build failed' });
        } finally {
          isBuildingPreview = false;
        }
        return;
      }

      if (pathname.startsWith('/preview/')) {
        const relativePath = pathname.replace('/preview/', '');
        const filePath = path.join(previewDir, relativePath || 'index.html');
        await serveStaticFile(res, filePath);
        return;
      }

      if (pathname === '/preview') {
        const filePath = path.join(previewDir, 'index.html');
        await serveStaticFile(res, filePath);
        return;
      }

      if (studioUiDir) {
        const uiPath = pathname === '/' ? '/index.html' : pathname;
        const filePath = path.join(studioUiDir, uiPath);
        await serveStaticFile(res, filePath);
        return;
      }

      sendText(
        res,
        200,
        `Tunecamp Studio UI non trovata.\n\n` +
          `Esegui:\n` +
          `  cd studio\n` +
          `  yarn install\n` +
          `  yarn dev\n\n` +
          `Poi apri http://localhost:5173\n`,
      );
    } catch (error: any) {
      sendJson(res, 500, { error: error?.message ?? 'Studio error' });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  return { server, port };
}

