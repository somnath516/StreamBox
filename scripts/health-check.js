const base = process.argv[2] || process.env.STREAMBOX_URL || 'http://127.0.0.1:5000';

async function main() {
  const res = await fetch(`${base.replace(/\/$/, '')}/health`, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => null);
  if (res.status !== 200 || data?.status !== 'OK') {
    console.error(JSON.stringify({ ok: false, status: res.status, data }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, status: res.status, data }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
