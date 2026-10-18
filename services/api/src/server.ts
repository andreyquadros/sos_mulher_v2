import { createApp } from './app.js';

try {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  const host = process.env.HOST || '127.0.0.1';
  const address = await app.listen({ port, host });
  process.stdout.write(`Mulher Lume API: ${address}\n`);
  if (process.env.DEMO_MODE === 'true') process.stdout.write('DEMONSTRAÇÃO LOCAL: somente dados fictícios; sem operação policial real.\n');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  }
} catch (error) {
  // Startup configuration errors contain only variable names, never their values.
  process.stderr.write(`${error instanceof Error ? error.message : 'Falha ao iniciar API.'}\n`);
  process.exitCode = 1;
}
