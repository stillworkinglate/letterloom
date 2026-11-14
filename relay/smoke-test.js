/**
 * Checks a deployed relay end to end: create a room, read it, update it, and
 * confirm that a write from an out-of-date copy is refused.
 *
 *   node relay/smoke-test.js https://your-project.vercel.app/api/room
 */
'use strict';

const url = process.argv[2];
if (!url || !/\/api\/room$/.test(url)) {
  console.error('Usage: node relay/smoke-test.js https://your-project.vercel.app/api/room');
  process.exit(2);
}

async function call(method, query, body) {
  const response = await fetch(url + (query ? `?${new URLSearchParams(query)}` : ''), {
    method,
    headers: body ? { 'Content-Type': 'application/json', Origin: 'https://example.github.io' } : { Origin: 'https://example.github.io' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    /* not JSON: reported below through the status check */
  }
  return { status: response.status, cors: response.headers.get('access-control-allow-origin'), payload };
}

function check(label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

(async () => {
  const created = await call('POST', null, { state: { smoke: 1 } });
  if (created.payload && created.payload.error === 'storage_not_configured') {
    console.error('FAIL The relay is running but has no database. Connect Upstash Redis to the project, then redeploy.');
    process.exit(1);
  }
  if (!check('create a room', created.status === 201 && created.payload && created.payload.v === 1, created)) return;
  check('other sites may call it (CORS)', created.cors === '*', created.cors);
  const code = created.payload.code;

  const read = await call('GET', { code });
  check('read it back', read.status === 200 && read.payload.state && read.payload.state.smoke === 1, read);

  const unchanged = await call('GET', { code, v: 1 });
  check('nothing new for an up-to-date copy', unchanged.payload && unchanged.payload.unchanged === true, unchanged);

  const written = await call('PUT', { code }, { v: 1, state: { smoke: 2 } });
  check('update it', written.status === 200 && written.payload.v === 2, written);

  const stale = await call('PUT', { code }, { v: 1, state: { smoke: 3 } });
  check(
    'refuse a write from an out-of-date copy',
    stale.status === 409 && stale.payload.v === 2 && stale.payload.state.smoke === 2,
    stale
  );

  const missing = await call('GET', { code: 'ZZZZZZ' });
  check('report an unknown code', missing.status === 404, missing);

  console.log(process.exitCode ? '\nThe relay is not working correctly.' : `\nThe relay works. Test room ${code} expires on its own in 30 days.`);
})().catch((err) => {
  console.error(`FAIL Could not reach ${url}: ${err.message}`);
  process.exit(1);
});
