// Pruebas HTTP del backend FloFlo. Node >= 20.
// Se usa la app real y se sustituye exclusivamente el módulo de conexión PG.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// No cargar el .env real ni usar credenciales externas de producción.
const originalCwd = process.cwd();
const temporaryCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'floflo-hito3-'));
process.chdir(temporaryCwd);
for (const key of Object.keys(process.env)) {
  if (/^(DATABASE_URL$|DB_|PG|JWT_|OPENAI_|CLOUDINARY_|RESEND_|FRONTEND_|EMAIL_FROM$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'floflo-hito3-only-local-test-secret-not-for-production',
  FRONTEND_URL: 'http://localhost:5173',
  OPENAI_API_KEY: 'test-not-a-real-key',
  RESEND_API_KEY: 're_test_not_a_real_key',
  CLOUDINARY_CLOUD_NAME: 'test',
  CLOUDINARY_API_KEY: 'test',
  CLOUDINARY_API_SECRET: 'test',
  APP_TIMEZONE: 'America/Santiago',
});
const PASSWORD = 'PruebaFloFlo2026!';
const fixture = {
  id: 900001, firstName: 'Usuario', lastName: 'Prueba',
  email: 'child@example.invalid', role: 'child', is_active: true,
  password: bcrypt.hashSync(PASSWORD, 10),
  rut: null, birth_date: null, avatar: null, created_at: '2026-01-01T00:00:00.000Z',
};
const { password: unused, ...publicUser } = fixture;
const parent = { ...publicUser, id: 900004, email: 'parent@example.invalid', role: 'parent', is_active: true };
const inactive = { ...publicUser, id: 900005, email: 'inactive@example.invalid', is_active: false };
const noRole = { ...publicUser, id: 900006, email: 'norole@example.invalid', role: null };
const usersById = new Map([publicUser, parent, inactive, noRole].map(user => [user.id, user]));
const calls = [];
const fakePool = {
  async query(sql, values = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: normalized, values });
    if (/^SELECT \* FROM "FloFlo"\."user" WHERE LOWER\(email\)/i.test(normalized)) {
      return { rows: values[0] === fixture.email ? [fixture] : [] };
    }
    if (/^SELECT\s+id,.*FROM "FloFlo"\."user" WHERE id = \$1/i.test(normalized)) {
      const user = usersById.get(Number(values[0]));
      return { rows: user ? [user] : [] };
    }
    if (/FROM "FloFlo"\.parent_child/i.test(normalized)) return { rows: [] };
    if (/FROM "FloFlo"\.mood\s+m\b/i.test(normalized)) {
      assert.equal(Number(values[0]), fixture.id);
      return { rows: [] };
    }
    if (/FROM "FloFlo"\.routine\s+r\b/i.test(normalized)) {
      assert.equal(Number(values[0]), fixture.id);
      return { rows: [] };
    }
    throw new Error('Consulta no prevista en el doble de pruebas');
  },
  async connect() { throw new Error('Conexión real bloqueada en pruebas'); },
  async end() {},
};
const dbPath = require.resolve('../src/database/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };
const app = require('../src/app');
const api = request(app);
const tokenFor = (payload = {}, options = { expiresIn: '5m' }) => jwt.sign({ id: fixture.id, email: fixture.email, role: 'child', ...payload }, process.env.JWT_SECRET, options);
const parentToken = () => tokenFor({ id: parent.id, email: parent.email, role: parent.role });
const auth = (req, token = tokenFor()) => req.set('Authorization', `Bearer ${token}`);

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(temporaryCwd, { recursive: true, force: true });
});

test('POST /api/auth/login — 200, JWT firmado y contraseña no expuesta', async () => {
  const res = await api.post('/api/auth/login').send({ email: fixture.email, password: PASSWORD }).expect(200);
  assert.equal(res.body.user.id, fixture.id);
  assert.equal(res.body.user.password, undefined);
  const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
  assert.equal(decoded.id, fixture.id);
  assert.equal(decoded.email, fixture.email);
  assert.equal(decoded.role, 'child');
});
test('POST /api/auth/login — 400 si faltan credenciales', async () => {
  const count = calls.length;
  await api.post('/api/auth/login').send({}).expect(400);
  assert.equal(calls.length, count);
});
test('POST /api/auth/login — 401 si la contraseña es incorrecta', async () => {
  await api.post('/api/auth/login').send({ email: fixture.email, password: 'incorrecta' }).expect(401);
});
test('POST /api/auth/login — 401 si el email no existe', async () => {
  await api.post('/api/auth/login').send({ email: 'missing@example.invalid', password: PASSWORD }).expect(401);
});
test('GET /api/auth/me — 200 devuelve el perfil propio sin contraseña', async () => {
  const res = await auth(api.get('/api/auth/me')).expect(200);
  assert.equal(res.body.id, fixture.id);
  assert.equal(res.body.email, fixture.email);
  assert.equal(res.body.password, undefined);
});
test('GET /api/auth/me — 401 sin token', async () => {
  const count = calls.length;
  await api.get('/api/auth/me').expect(401);
  assert.equal(calls.length, count);
});
test('GET /api/auth/me — 401 con firma inválida', async () => {
  const badToken = jwt.sign({ id: fixture.id }, 'different-test-secret');
  await auth(api.get('/api/auth/me'), badToken).expect(401);
});
test('GET /api/auth/me — 401 con JWT expirado', async () => {
  await auth(api.get('/api/auth/me'), tokenFor({}, { expiresIn: -10 })).expect(401);
});
test('GET /api/auth/me — 401 si el usuario ya no existe', async () => {
  const res = await auth(api.get('/api/auth/me'), tokenFor({ id: 900002 })).expect(401);
  assert.equal(res.body.message, 'Usuario no encontrado o sesión inválida');
});
test('GET /api/auth/me — 403 si la cuenta está desactivada', async () => {
  const res = await auth(api.get('/api/auth/me'), tokenFor({ id: inactive.id, email: inactive.email })).expect(403);
  assert.equal(res.body.message, 'Esta cuenta se encuentra desactivada');
});
test('GET /api/auth/me — 403 si el usuario no tiene un rol válido', async () => {
  const res = await auth(api.get('/api/auth/me'), tokenFor({ id: noRole.id, email: noRole.email })).expect(403);
  assert.equal(res.body.message, 'Usuario sin perfil de acceso válido');
});
test('GET /api/moods — 200 devuelve una lista del niño autenticado', async () => {
  const res = await auth(api.get('/api/moods')).expect(200);
  assert.ok(Array.isArray(res.body));
});
test('GET /api/moods — 401 sin token', async () => {
  await api.get('/api/moods').expect(401);
});
test('GET /api/moods — 403 cuando un adulto usa la ruta del niño', async () => {
  await auth(api.get('/api/moods'), parentToken()).expect(403);
});
test('GET /api/moods — 403 si el JWT dice child pero PostgreSQL dice parent', async () => {
  const count = calls.length;
  await auth(api.get('/api/moods'), tokenFor({ id: parent.id, email: parent.email, role: 'child' })).expect(403);
  assert.ok(calls.slice(count).some(call => /FROM "FloFlo"\."user" WHERE id = \$1/i.test(call.sql) && Number(call.values[0]) === parent.id));
  assert.ok(!calls.slice(count).some(call => /FROM "FloFlo"\.mood\s+m\b/i.test(call.sql)));
});
test('GET /api/routines — 200 devuelve una lista del niño autenticado', async () => {
  const res = await auth(api.get('/api/routines')).expect(200);
  assert.ok(Array.isArray(res.body));
});
test('GET /api/routines — 401 sin token', async () => {
  await api.get('/api/routines').expect(401);
});
test('GET /api/routines — 403 cuando un adulto usa la ruta del niño', async () => {
  await auth(api.get('/api/routines'), parentToken()).expect(403);
});
test('GET /api/routines/children/:childId — 403 sin relación autorizada', async () => {
  const count = calls.length;
  await auth(api.get('/api/routines/children/900003'), parentToken()).expect(403);
  assert.ok(calls.slice(count).some(call => /FROM "FloFlo"\.parent_child/i.test(call.sql)), 'Debe consultar la relación cuidador-niño');
});
test('OPTIONS /api/auth/login — CORS permite el frontend local', async () => {
  const res = await api.options('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type,authorization')
    .expect(204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
});
