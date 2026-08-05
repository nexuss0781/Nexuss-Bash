const BASE = process.env.NEXUSS_BASE_URL || 'http://localhost:3999';

if (!process.env.NEXUSS_BASE_URL) {
  process.env.API_KEY = 'test-admin-key';
  process.env.PORT = '3999';
  process.env.PARADOX_DB = 'auth-it-' + process.pid;
  process.env.PARADOX_PASSPHRASE = 'testpass';
  process.env.WORKSPACE_BASE = '/tmp/opencode/nexauth';
  require('../services/api/server.js');
}

let ok = 0, fail = 0;
function ck(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' ' + extra : ''));
  cond ? ok++ : fail++;
}
async function call(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
(async () => {
  await new Promise((res) => setTimeout(res, 2500));
  let h = await call('GET', '/health');
  ck('health public 200', h.status === 200);
  let no = await call('GET', '/jobs');
  ck('no key 401', no.status === 401);
  if (!process.env.NEXUSS_BASE_URL) {
    let ad = await call('GET', '/jobs', null, { Authorization: 'Bearer test-admin-key' });
    ck('legacy admin key 200', ad.status === 200);
  }
  let bad = await call('GET', '/jobs', null, { 'X-API-Key': 'pk_bogus' });
  ck('bogus pk key 401', bad.status === 401);
  const runEmail = 'alice' + Date.now() + '@test.dev';
  let reg = await call("POST", "/auth/register", { email: runEmail, username: "alice", password: "super-secret-1" });

  ck('register 201', reg.status === 201);
  ck('register returns pk_ key', reg.data && reg.data.data && reg.data.data.api_key && reg.data.data.api_key.startsWith('pk_'));
  const key = reg.data.data.api_key;
  let dup = await call('POST', '/auth/register', { email: runEmail, username: 'alice2', password: 'super-secret-1' });
  ck('duplicate email 409', dup.status === 409);
  let me = await call('GET', '/auth/me', null, { 'X-API-Key': key });
  ck('me 200 + user', me.status === 200 && me.data.data.username === 'alice');
  let jb = await call('GET', '/jobs', null, { 'X-API-Key': key });
  ck('per-user key 200 on /jobs', jb.status === 200);
  let badlog = await call('POST', '/auth/login', { email: runEmail, password: 'wrongpassword' });
  ck('wrong password 401', badlog.status === 401);
  let login = await call('POST', '/auth/login', { email: runEmail, password: 'super-secret-1' });
  ck('login 200 + new key', login.status === 200 && login.data.data.api_key && login.data.data.api_key !== key);
  let olddead = await call('GET', '/auth/me', null, { 'X-API-Key': key });
  ck('old key invalidated after login 401', olddead.status === 401);
  const key2 = login.data.data.api_key;
  let me2 = await call('GET', '/auth/me', null, { 'X-API-Key': key2 });
  ck('new key works 200', me2.status === 200);
  let mint = await call('POST', '/auth/api-key', null, { 'X-API-Key': key2 });
  ck('mint 200 + rotates', mint.status === 200 && mint.data.data.api_key && mint.data.data.api_key !== key2);
  let olddead2 = await call('GET', '/auth/me', null, { 'X-API-Key': key2 });
  ck('old key invalid after mint 401', olddead2.status === 401);
  let minted = await call('GET', '/auth/me', null, { 'X-API-Key': mint.data.data.api_key });
  ck('minted key works', minted.status === 200);
  let run = await call('POST', '/run', { commands: ['echo hello-from-user', 'pwd'] }, { 'X-API-Key': mint.data.data.api_key });
  ck('run command with per-user key', run.status === 200 && JSON.stringify(run.data).includes('hello-from-user'));
  if (!process.env.NEXUSS_BASE_URL) {
    let admint = await call('POST', '/auth/api-key', null, { Authorization: 'Bearer test-admin-key' });
    ck('admin key cannot mint 400', admint.status === 400);
  }
  console.log(`\n== RESULT: ${ok} passed, ${fail} failed ==`);
  process.exit(fail === 0 ? 0 : 1);
})();
