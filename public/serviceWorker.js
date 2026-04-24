const CHATGPT_NEXT_WEB_CACHE = "chatgpt-next-web-cache";
const CHATGPT_NEXT_WEB_FILE_CACHE = "chatgpt-next-web-file";

// LRU eviction cap. Prevents indefinite growth of generated/uploaded images.
// FIFO by Cache.keys() insertion order (spec-defined). When the cache exceeds
// MAX_CACHED_FILES, the oldest (HIGH_WATER - LOW_WATER) entries are deleted.
const MAX_CACHED_FILES = 500;
const EVICT_TARGET = 400;

let a="useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";let nanoid=(e=21)=>{let t="",r=crypto.getRandomValues(new Uint8Array(e));for(let n=0;n<e;n++)t+=a[63&r[n]];return t};

async function evictIfNeeded(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_CACHED_FILES) return;
    const toDelete = keys.length - EVICT_TARGET;
    // keys() returns requests in insertion order (oldest first per CacheStorage spec)
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
    console.log('[SW] evicted', toDelete, 'old cache entries');
  } catch (e) {
    console.warn('[SW] cache eviction failed', e);
  }
}

self.addEventListener("activate", function (event) {
  console.log("ServiceWorker activated.");
});

self.addEventListener("install", function (event) {
  self.skipWaiting();  // enable new version
  event.waitUntil(
    caches.open(CHATGPT_NEXT_WEB_CACHE).then(function (cache) {
      return cache.addAll([]);
    }),
  );
});

function jsonify(data) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
}

async function upload(request, url) {
  const formData = await request.formData()
  const file = formData.getAll('file')[0]
  let ext = file.name.split('.').pop()
  if (ext === 'blob') {
    ext = file.type.split('/').pop()
  }
  const fileUrl = `${url.origin}/api/cache/${nanoid()}.${ext}`
  // console.debug('file', file, fileUrl, request)
  const cache = await caches.open(CHATGPT_NEXT_WEB_FILE_CACHE)
  await cache.put(new Request(fileUrl), new Response(file, {
    headers: {
      'content-type': file.type,
      'content-length': file.size,
      'cache-control': 'no-cache', // file already store in disk
      'server': 'ServiceWorker',
    }
  }))
  // Best-effort LRU eviction (non-blocking semantically — awaited only briefly)
  await evictIfNeeded(cache)
  return jsonify({ code: 0, data: fileUrl })
}

async function remove(request, url) {
  const cache = await caches.open(CHATGPT_NEXT_WEB_FILE_CACHE)
  const res = await cache.delete(request.url)
  return jsonify({ code: 0 })
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (/^\/api\/cache/.test(url.pathname)) {
    if ('GET' == e.request.method) {
      e.respondWith(caches.match(e.request))
    }
    if ('POST' == e.request.method) {
      e.respondWith(upload(e.request, url))
    }
    if ('DELETE' == e.request.method) {
      e.respondWith(remove(e.request, url))
    }
  }
});
