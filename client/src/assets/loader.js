
function abortError() {
  return new DOMException("Operation aborted", "AbortError");
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.json();
}

export async function withRetry(
  operation,
  {
    attempts = 3,
    baseMs = 400,
    signal
  } = {}
) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw abortError();

    try {
      return await operation(signal);
    } catch (error) {
      lastError = error;

      if (error.name === "AbortError") {
        throw error;
      }

      // HTTP 4xx — помилка запиту, повторювати його не потрібно.
      if (/HTTP 4\d\d/.test(error.message)) {
        throw error;
      }

      if (attempt === attempts - 1) {
        throw error;
      }

      const delay = baseMs * 2 ** attempt;
      const jitter = Math.random() * baseMs;

      await wait(delay + jitter, signal);
    }
  }

  throw lastError;
}

export async function loadImage(url, signal) {
  return withRetry(async (activeSignal) => {
    const response = await fetch(url, { signal: activeSignal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    try {
      if (activeSignal?.aborted) {
        throw abortError();
      }

      image.src = objectUrl;

      await image.decode();

      if (activeSignal?.aborted) {
        throw abortError();
      }

      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, { signal });
}

export async function loadAudio(audioContext, url, signal) {
  console.log(`[AUDIO] Початок завантаження: ${url}`);

  return withRetry(async (activeSignal) => {
    const response = await fetch(url, { signal: activeSignal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const data = await response.arrayBuffer();

    console.log(`[AUDIO] Отримано ${data.byteLength} байт: ${url}`);

    const decodedAudio = await audioContext.decodeAudioData(data);

    console.log(`[AUDIO] Успішно декодовано: ${url}`);

    return decodedAudio;
  }, { signal });
}

export async function loadJson(url, signal) {
  return withRetry(
    (activeSignal) => fetchJson(url, activeSignal),
    { signal }
  );
}

export async function loadAll(
  manifest,
  {
    audioContext,
    onProgress = () => {},
    signal
  } = {}
) {
  const resources = [
    ...manifest.images.map((item) => ({
      ...item,
      type: "image"
    })),
    ...manifest.sounds.map((item) => ({
      ...item,
      type: "sound"
    })),
    {
      name: "arena",
      url: manifest.arena,
      type: "json"
    }
  ];

  const loaded = {};
  let completed = 0;
  const total = resources.length;

  const tasks = resources.map(async (resource) => {
  console.log(`[LOADER] Початок: ${resource.name} (${resource.url})`);

  try {
    if (signal?.aborted) throw abortError();

    let value;

    if (resource.type === "image") {
      value = await loadImage(resource.url, signal);
    } else if (resource.type === "sound") {
      value = await loadAudio(
        audioContext,
        resource.url,
        signal
      );
    } else {
      value = await loadJson(resource.url, signal);
    }

    loaded[resource.name] = value;
    completed++;

    console.log(`[LOADER] Успішно: ${resource.name}`);

    onProgress({
      completed,
      total,
      ratio: completed / total,
      name: resource.name
    });

    return value;
  } catch (error) {
    console.error(
      `[LOADER] Помилка ресурсу ${resource.name}:`,
      error
    );

    throw error;
  }
});

  await Promise.all(tasks);

  return loaded;
}
