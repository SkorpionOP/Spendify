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
      const reply = {
        setHeader: (k, v) => res.setHeader(k, v),
        status(code) {
          res.statusCode = code;
          return reply;
        },
        json(obj) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(obj));
        },
      };
      await handler({ method: req.method, body }, reply);
    });
  }
};

export const localApi = () => ({
  name: 'spendify-local-api',
  config(_, { mode }) {
    const env = loadEnv(mode, process.cwd(), '');
    for (const k of ['GROQ_API_KEY', 'GROQ_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  },
  configureServer(server) {
    mount(server.middlewares);
  },
  configurePreviewServer(server) {
    mount(server.middlewares);
  },
});
