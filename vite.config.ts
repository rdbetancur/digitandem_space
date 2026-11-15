import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo, atiende /api/mission-control con la misma lógica que la función de Vercel.
 * Lee GEMINI_API_KEY de .env.local; la clave se queda en el servidor de desarrollo.
 */
function missionControlDev(apiKey: string | undefined): Plugin {
  return {
    name: 'mission-control-dev',
    configureServer(server) {
      server.middlewares.use('/api/mission-control', (req, res) => {
        const send = (status: number, json: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(json));
        };
        if (req.method !== 'POST') { send(405, { error: 'metodo', message: 'Use POST.' }); return; }
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; if (raw.length > 100_000) req.destroy(); });
        req.on('end', async () => {
          try {
            const { missionControl } = await import('./server/missionControl.js');
            const out = await missionControl(JSON.parse(raw || '{}'), apiKey);
            send(out.status, out.json);
          } catch {
            send(400, { error: 'solicitud', message: 'Invalid request.' });
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), missionControlDev(env.GEMINI_API_KEY)],
    server: { port: 5173 },
  };
});
