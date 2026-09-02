const base = (process.argv[2] || process.env.STREAMBOX_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

async function read(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 120);
  }
}

function matchesSubset(data, expected) {
  if (!expected || typeof expected !== 'object') return data === expected;
  if (!data || typeof data !== 'object') return false;
  return Object.entries(expected).every(([key, value]) => data[key] === value);
}

async function expectJson(pathname, options, status, body) {
  const res = await fetch(`${base}${pathname}`, options);
  const data = await read(res);
  const type = res.headers.get('content-type') || '';
  if (res.status !== status || !type.includes('application/json') || !matchesSubset(data, body)) {
    throw new Error(`${pathname} expected ${status} ${JSON.stringify(body)} got ${res.status} ${JSON.stringify(data)}`);
  }
}

async function main() {
  await expectJson('/admin', {}, 401, { error: 'Unauthorized' });
  await expectJson('/upload', { method: 'POST' }, 401, { error: 'Unauthorized' });
  await expectJson('/movies/1', { method: 'DELETE' }, 401, { error: 'Unauthorized' });
  await expectJson('/movies/%2F%2F%2E%2E', {}, 400, { error: 'Request failed' });

  const health = await fetch(`${base}/health`).then((r) => r.json());
  if (health.status !== 'OK') throw new Error('Health failed');

  const movies = await fetch(`${base}/movies`).then((r) => r.json());
  if (!Array.isArray(movies)) throw new Error('/movies did not return an array');

  const movie = movies.find((item) => item.movie);
  if (movie) {
    const res = await fetch(`${base}/video/${encodeURIComponent(movie.movie)}`, { headers: { Range: 'bytes=0-99' } });
    if (res.status !== 206 && res.status !== 200) throw new Error(`Range stream failed: ${res.status}`);
  }

  console.log(JSON.stringify({ ok: true, movies: movies.length, rangeChecked: Boolean(movie) }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
