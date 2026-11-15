/*
 * Runs the Vercel functions in api/ during `npm run dev` and `npm run preview`, so AI features can be
 * tested locally. Keys come from .env.local (git-ignored) and stay on the server side: they are put on
 * process.env for the function, not exposed to the browser (Vite only exposes VITE_* variables).
 */
import { loadEnv } from 'vite';

const ROUTES = { '/api/understand': () => import('./api/understand.js') };

const mount = (middlewares) => {
  for (const [path, load] of Object.entries(ROUTES)) {
    middlewares.use(path, async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        /* the function answers 400 */
      }
      const { default: handler } = await load();
      // The real Node response, with the two Vercel helpers added, so streamed replies (res.write) work too
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (obj) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      await handler({ method: req.method, body, headers: req.headers, socket: req.socket }, res);
    });
  }
};

export const localApi = () => ({
  name: 'spendify-local-api',
  config(_, { mode }) {
    const env = loadEnv(mode, process.cwd(), '');
    for (const k of ['GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_VISION_MODEL', 'AI_RATE_PER_MINUTE', 'AI_RATE_PER_DAY', 'ALLOWED_ORIGINS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  },
  configureServer(server) {
    mount(server.middlewares);
  },
  configurePreviewServer(server) {
    mount(server.middlewares);
  },
});
