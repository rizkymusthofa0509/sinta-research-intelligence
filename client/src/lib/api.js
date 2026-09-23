/**
 * Start a search over Server-Sent Events.
 * Returns a cancel function. Callbacks: onProgress(p), onArticles(articles[]) as they are
 * crawled, onResult(finalData), onError({error, message}).
 */
export function streamSearch({ q, limit, category, deep, sources, scope }, { onProgress, onArticles, onPlan, onResult, onError }) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (category && category !== 'all') params.set('category', category);
  if (deep) params.set('deep', '1');
  if (sources?.length) params.set('sources', sources.join(','));
  if (scope) params.set('scope', scope);

  const source = new EventSource(`/api/search/stream?${params}`);
  let finished = false;
  let watchdog = null;
  const finish = () => {
    finished = true;
    clearTimeout(watchdog);
    source.close();
  };
  // The server sends a progress or ping event at least every 10 s; silence means the API went away.
  const touch = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (finished) return;
      finish();
      onError?.({ error: 'CONNECTION', message: 'The explorer API stopped responding. Please try again.' });
    }, 35000);
  };
  touch();

  source.addEventListener('ping', touch);
  source.addEventListener('progress', (e) => {
    touch();
    onProgress?.(JSON.parse(e.data));
  });
  source.addEventListener('plan', (e) => {
    touch();
    onPlan?.(JSON.parse(e.data));
  });
  source.addEventListener('articles', (e) => {
    touch();
    onArticles?.(JSON.parse(e.data).articles);
  });
  source.addEventListener('result', (e) => {
    finish();
    onResult?.(JSON.parse(e.data));
  });
  source.addEventListener('failure', (e) => {
    finish();
    onError?.(JSON.parse(e.data));
  });
  source.onerror = () => {
    if (finished) return;
    finish();
    onError?.({ error: 'CONNECTION', message: 'Lost connection to the explorer API. Is the server running (npm run dev)?' });
  };

  return finish;
}

/** Documents each source reports for a query (used to verify gaps and combinations). */
export async function countDocuments(q, scope = 'id') {
  const res = await fetch(`/api/count?${new URLSearchParams({ q, scope })}`);
  if (!res.ok) throw new Error('Count unavailable');
  return res.json();
}
