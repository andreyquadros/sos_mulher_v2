import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import { z, ZodError } from 'zod';
import { readConfig, type AppConfig } from './config.js';
import type { ChangeEvent, Device, Operator } from './models.js';
import { ApiError, hashPassword, hashToken, newToken, RateLimiter, trustPrivateProxy, verifyPassword } from './security.js';
import { Store } from './store.js';

const COOKIE = 'ml_session';
const idSchema = z.object({ id: z.uuid() }).strict();
const emptySchema = z.object({}).strict().default({});
const sequenceSchema = z.number().int().min(0).max(2_147_483_647);
const timestampSchema = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), password: z.string().min(1).max(256) }).strict();
const womanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(32).regex(/^[+()\d\s.-]+$/),
  reference: z.string().trim().min(2).max(64),
  notes: z.string().trim().max(2000).default(''),
}).strict();
const pairSchema = z.object({ code: z.string().regex(/^\d{8}$/), consentVersion: z.literal('2026-10'), consentLocation: z.literal(true), consentAudio: z.boolean() }).strict();
const incidentSchema = z.object({
  clientEventId: z.uuid(), trigger: z.enum(['hold', 'volume', 'notification', 'voice']),
  simulated: z.boolean(), createdAt: timestampSchema,
}).strict();
const locationSchema = z.object({
  sequence: sequenceSchema, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000), capturedAt: timestampSchema, battery: z.number().min(0).max(100).optional(),
}).strict();
const claimSchema = z.object({ expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }).strict();
const resolveSchema = claimSchema.extend({ resolution: z.string().trim().min(10).max(2000) }).strict();
const audioQuerySchema = z.object({ sequence: z.string().regex(/^(0|[1-9]\d{0,9})$/).transform(Number).pipe(sequenceSchema), capturedAt: timestampSchema }).strict();

function sessionToken(request: FastifyRequest): string | undefined {
  const item = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
  const token = item?.slice(COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '');
  return match?.[1];
}

/** Creates a complete application without binding a port. Tests use app.inject(). */
export async function createApp(options: Partial<AppConfig> = {}) {
  const config = readConfig(options);
  const app = Fastify({ logger: false, bodyLimit: 32 * 1024, trustProxy: trustPrivateProxy(config.trustProxyHops), requestTimeout: 30_000 });
  const store = new Store(config);
  try { await store.initialize(); }
  catch (error) { store.close(); throw error; }
  const limiter = new RateLimiter();
  const dummyPassword = await hashPassword(newToken());
  const streams = new Set<ServerResponse>();
  const operatorStreams = new Map<string, number>();
  store.events.setMaxListeners(0);

  // Expose persistence for controlled provisioning and integration tests, never via HTTP.
  app.decorate('store', store);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    if (config.environment === 'production') reply.header('Strict-Transport-Security', 'max-age=31536000');
    // A reverse proxy can be the source IP for every phone and panel. Only verified
    // identities get their own bucket; invented or revoked tokens stay in the IP bucket.
    const bearer = bearerToken(request);
    const authenticatedDevice = bearer ? store.device(bearer) : undefined;
    const cookie = sessionToken(request);
    const authenticatedOperator = !authenticatedDevice && cookie ? store.session(cookie) : undefined;
    const bucket = authenticatedDevice ? `device:${authenticatedDevice.id}`
      : authenticatedOperator ? `operator:${authenticatedOperator.id}` : `anonymous:${request.ip}`;
    limiter.take(`global:${bucket}`, 600, 60_000);
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Origem não autorizada.');
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Dados inválidos. Confira os campos e tente novamente.' });
    if (error instanceof ApiError) {
      if (error.statusCode === 429) reply.header('Retry-After', '60');
      return reply.code(error.statusCode).send({ error: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      const message = status === 413 ? 'Conteúdo excede o limite permitido.' : status === 415 ? 'Tipo de conteúdo não aceito.' : 'Solicitação inválida.';
      return reply.code(status).send({ error: message });
    }
    // Log only a correlation identifier; requests, query strings, payloads, secrets and PII are excluded.
    process.stderr.write(`[api] falha interna; requestId=${_request.id}\n`);
    return reply.code(500).send({ error: 'Falha interna. Tente novamente.' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Rota não encontrada.' }));

  app.addContentTypeParser(['audio/aac', 'audio/mp4'], { parseAs: 'buffer', bodyLimit: 512 * 1024 }, (_request, body, done) => done(null, body));

  function requireOrigin(request: FastifyRequest) {
    if (request.headers.origin !== config.panelOrigin) throw new ApiError(403, 'Origem não autorizada. Abra o painel institucional configurado.');
  }
  function operator(request: FastifyRequest, mutate = false): Operator {
    if (mutate) requireOrigin(request);
    const token = sessionToken(request);
    const current = token ? store.session(token) : undefined;
    if (!current) throw new ApiError(401, 'Sessão expirada. Entre novamente.');
    if (mutate && !['admin', 'dispatcher'].includes(current.role)) throw new ApiError(403, 'Seu perfil permite somente consulta.');
    return current;
  }
  function device(request: FastifyRequest): Device {
    const token = bearerToken(request);
    const current = token ? store.device(token) : undefined;
    if (!current) throw new ApiError(401, 'Dispositivo não autorizado. Faça o pareamento na central.');
    return current;
  }
  function setCookie(reply: FastifyReply, token: string, maxAge: number) {
    reply.header('Set-Cookie', `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`);
  }

  app.get('/api/health', async () => ({ status: 'ok', demoMode: config.demoMode, serverTime: new Date().toISOString() }));

  app.post('/api/auth/login', async (request, reply) => {
    requireOrigin(request);
    limiter.take(`login-ip:${request.ip}`, 10, 15 * 60_000);
    const body = loginSchema.parse(request.body);
    limiter.take(`login-account:${hashToken(body.email)}:${request.ip}`, 6, 15 * 60_000);
    const row = store.operatorByEmail(body.email);
    const verified = await verifyPassword(body.password, row?.passwordHash ?? dummyPassword);
    if (!row || !verified) throw new ApiError(401, 'E-mail ou senha inválidos.');
    const current = store.publicOperator(row);
    const token = store.createSession(current);
    setCookie(reply, token, Math.floor(config.sessionHours * 3600));
    return { operator: current };
  });
  app.get('/api/auth/me', async request => ({ operator: operator(request) }));
  app.post('/api/auth/logout', async (request, reply) => {
    requireOrigin(request);
    const current = operator(request);
    emptySchema.parse(request.body);
    store.deleteSession(sessionToken(request)!, current);
    // End any open event stream for this session immediately; heartbeat also checks expiry.
    store.events.emit('session-revoked', hashToken(sessionToken(request)!));
    setCookie(reply, '', 0);
    return { ok: true };
  });
  app.get('/api/snapshot', async request => store.snapshot(operator(request)));

  app.post('/api/women', async (request, reply) => {
    const current = operator(request, true);
    limiter.take(`create-woman:${current.id}`, 30, 60_000);
    const woman = store.createWoman(current, womanSchema.parse(request.body));
    return reply.code(201).send({ woman });
  });
  app.post('/api/women/:id/pairing', async request => {
    const current = operator(request, true);
    limiter.take(`pairing-create:${current.id}`, 30, 60_000);
    const { id } = idSchema.parse(request.params);
    emptySchema.parse(request.body);
    return store.createPairing(current, id);
  });

  app.post('/api/devices/pair', async request => {
    limiter.take(`pair-device:${request.ip}`, 10, 10 * 60_000);
    const body = pairSchema.parse(request.body);
    return store.pairDevice(body.code, body.consentAudio);
  });
  app.get('/api/devices/me', async request => {
    const current = device(request);
    return { deviceId: current.id, womanName: current.womanName, consentAudio: current.consentAudio, activeIncident: store.activeIncident(current) };
  });
  app.post('/api/device/incidents', async (request, reply) => {
    const current = device(request);
    limiter.take(`incident:${current.id}`, 20, 60_000);
    const body = incidentSchema.parse(request.body);
    const incident = store.createIncident(current, { ...body, simulated: config.demoMode || body.simulated });
    return reply.code(201).send({ incident });
  });
  app.post('/api/device/incidents/:id/locations', async request => {
    const current = device(request);
    limiter.take(`location:${current.id}`, 120, 60_000);
    const { id } = idSchema.parse(request.params);
    const body = locationSchema.parse(request.body);
    store.addLocation(current, id, body);
    return { accepted: true };
  });
  app.post('/api/device/incidents/:id/audio', { bodyLimit: 512 * 1024 }, async request => {
    const current = device(request);
    limiter.take(`audio:${current.id}`, 40, 60_000);
    const { id } = idSchema.parse(request.params);
    const { sequence, capturedAt } = audioQuerySchema.parse(request.query);
    const mimeType = request.headers['content-type']?.split(';')[0]?.trim();
    if (!mimeType || !['audio/aac', 'audio/mp4'].includes(mimeType)) throw new ApiError(415, 'Use audio/aac ou audio/mp4.');
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0 || data.length > 512 * 1024) throw new ApiError(400, 'Bloco de áudio vazio ou inválido.');
    store.addAudio(current, id, sequence, capturedAt, mimeType, data);
    return { accepted: true };
  });

  app.post('/api/incidents/:id/ack', async request => {
    const current = operator(request, true);
    emptySchema.parse(request.body);
    return { incident: store.acknowledge(current, idSchema.parse(request.params).id) };
  });
  app.post('/api/incidents/:id/claim', async request => {
    const current = operator(request, true);
    const { expectedRevision } = claimSchema.parse(request.body);
    return { incident: store.claim(current, idSchema.parse(request.params).id, expectedRevision) };
  });
  app.post('/api/incidents/:id/resolve', async request => {
    const current = operator(request, true);
    const { expectedRevision, resolution } = resolveSchema.parse(request.body);
    return { incident: store.resolve(current, idSchema.parse(request.params).id, expectedRevision, resolution) };
  });
  app.get('/api/incidents/:id/locations', async request => ({ locations: store.locations(operator(request), idSchema.parse(request.params).id) }));
  app.get('/api/incidents/:id/audio', async request => ({ chunks: store.audioChunks(operator(request), idSchema.parse(request.params).id) }));
  app.get('/api/audio/:id/content', async (request, reply) => {
    const current = operator(request);
    limiter.take(`audio-read:${current.id}`, 90, 60_000);
    const chunk = store.audioContent(current, idSchema.parse(request.params).id);
    return reply.header('Content-Disposition', 'inline').type(chunk.mimeType).send(chunk.data);
  });

  app.get('/api/events', async (request, reply) => {
    const current = operator(request);
    const token = sessionToken(request)!;
    const currentStreams = operatorStreams.get(current.id) ?? 0;
    if (currentStreams >= 3 || streams.size >= 1000) throw new ApiError(429, 'Limite de conexões de eventos atingido.');
    const lastId = request.headers['last-event-id'];
    if (lastId !== undefined && (typeof lastId !== 'string' || !/^\d{1,15}$/.test(lastId))) throw new ApiError(400, 'Sequência de eventos inválida.');
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
    });
    streams.add(response);
    operatorStreams.set(current.id, currentStreams + 1);
    response.write('retry: 3000\n\n');
    const send = (change: ChangeEvent) => {
      if (!store.session(token)) { response.end(); return; }
      if (response.writableLength > 64 * 1024) { response.end(); return; }
      response.write(`id: ${change.seq}\nevent: change\ndata: ${JSON.stringify(change)}\n\n`);
    };
    const onChange = (agencyId: string, change: ChangeEvent) => { if (agencyId === current.agencyId) send(change); };
    const onRevoked = (tokenHash: string) => { if (tokenHash === hashToken(token)) response.end(); };
    store.events.on('change', onChange);
    store.events.on('session-revoked', onRevoked);
    if (lastId !== undefined) {
      const since = Number(lastId);
      const changes = store.changesSince(current.agencyId, since);
      if (changes.length > 500 || since > store.latestSequence(current.agencyId)) send({ seq: store.latestSequence(current.agencyId), kind: 'snapshot' });
      else for (const change of changes) send(change);
    } else send({ seq: store.latestSequence(current.agencyId), kind: 'snapshot' });
    const heartbeat = setInterval(() => {
      if (!store.session(token) || response.writableLength > 64 * 1024) response.end();
      else response.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    }, config.heartbeatMs);
    heartbeat.unref();
    response.on('close', () => {
      clearInterval(heartbeat);
      streams.delete(response);
      operatorStreams.set(current.id, Math.max(0, (operatorStreams.get(current.id) ?? 1) - 1));
      store.events.off('change', onChange);
      store.events.off('session-revoked', onRevoked);
    });
  });

  app.addHook('preClose', async () => { for (const stream of streams) stream.end(); });
  app.addHook('onClose', async () => store.close());
  return app as typeof app & { store: Store };
}
