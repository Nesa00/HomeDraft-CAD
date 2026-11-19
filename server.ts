import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

async function startServer(): Promise<void> {
  const app = express();
  const cliPort = readCliArg('--port') ?? readCliArg('-p');
  const cliHost = readCliArg('--host');
  const port = Number(cliPort ?? process.env.PORT ?? process.env.DEFAULT_APP_PORT ?? 3000);
  const host = cliHost ?? process.env.HOST ?? '0.0.0.0';
  const isProd = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'homedraft-cad' });
  });

  if (!isProd) {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          ...(disableHmr ? { hmr: false, ws: false as const } : {}),
        },
        appType: 'spa',
      }),
    );

    vitePromise.catch((err: unknown) => {
      console.error('Failed to initialize Vite middleware:', err);
      process.exit(1);
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      vitePromise
        .then((vite) => {
          vite.middlewares(req, res, next);
        })
        .catch(next);
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        index: false,
      }),
    );

    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(port, host, () => {
    console.log(`HomeDraft-CAD listening on http://${host}:${port} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
