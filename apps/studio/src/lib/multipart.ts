/**
 * Uploading a service recording from the browser, in parts.
 *
 * A single PUT caps at 5 GB, cannot resume, and gets one connection's
 * throughput. This cuts the file up, sends several parts at once, and
 * retries only the part that failed — so a dropped connection costs ten
 * megabytes rather than the whole upload.
 *
 * Still XMLHttpRequest rather than fetch, for the same reason as before:
 * fetch cannot report upload progress, and a church uploading three
 * gigabytes needs to see something moving.
 */

export type UploadProgress = {
  percent: number;
  loaded: number;
  total: number;
  /** How many parts are done — worth showing, because it is the thing that
   *  survives a stall. A percentage that stops moving looks like a hang;
   *  "41 of 300 parts" looks like a slow connection, which is the truth. */
  partsDone: number;
  partsTotal: number;
};

/** How many parts to have in the air at once.
 *
 *  Four is a compromise: enough to fill a domestic upstream, few enough
 *  that a church's router is not the thing that breaks. More connections
 *  stop helping once the pipe is full and start causing timeouts. */
const CONCURRENCY = 4;

/** Per part, not per upload. A whole upload should not die because one
 *  part hit a blip forty minutes in. */
const MAX_ATTEMPTS = 3;

function putPart(
  url: string,
  blob: Blob,
  onBytes: (loaded: number) => void,
  signal: { aborted: boolean; xhrs: Set<XMLHttpRequest> },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhrs.add(xhr);
    xhr.open("PUT", url, true);

    xhr.upload.onprogress = (e) => onBytes(e.loaded);

    xhr.onload = () => {
      signal.xhrs.delete(xhr);
      if (xhr.status >= 200 && xhr.status < 300) {
        // The ETag identifies the part in the completion call. S3 sends it
        // quoted and the quotes are part of the value — stripping them
        // makes the completion fail with a signature error that looks like
        // it is about credentials.
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          reject(new Error("S3 accepted a part but returned no ETag"));
          return;
        }
        resolve(etag);
        return;
      }
      const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText)?.[1];
      reject(new Error(code ? `S3 refused a part (${code})` : `HTTP ${xhr.status}`));
    };

    xhr.onerror = () => {
      signal.xhrs.delete(xhr);
      reject(new Error("The connection dropped"));
    };
    xhr.onabort = () => {
      signal.xhrs.delete(xhr);
      reject(new Error("Upload cancelled"));
    };

    xhr.send(blob);
  });
}

export function uploadInParts(
  file: File,
  urls: string[],
  partSize: number,
  onProgress: (p: UploadProgress) => void,
): { promise: Promise<string[]>; abort: () => void } {
  const signal = { aborted: false, xhrs: new Set<XMLHttpRequest>() };
  const etags = new Array<string>(urls.length);

  // Bytes sent per part, so aggregate progress can be recomputed whenever
  // any part moves. Summing per-part totals is the only honest way to show
  // one number when four uploads are in flight at once.
  const sent = new Array<number>(urls.length).fill(0);
  let partsDone = 0;

  const report = () => {
    const loaded = sent.reduce((a, b) => a + b, 0);
    onProgress({
      percent: Math.min(100, Math.round((loaded / file.size) * 100)),
      loaded: Math.min(loaded, file.size),
      total: file.size,
      partsDone,
      partsTotal: urls.length,
    });
  };

  const promise = (async () => {
    let next = 0;

    const worker = async () => {
      while (!signal.aborted) {
        const index = next++;
        if (index >= urls.length) return;

        const blob = file.slice(index * partSize, (index + 1) * partSize);

        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            etags[index] = await putPart(
              urls[index],
              blob,
              (loaded) => {
                sent[index] = loaded;
                report();
              },
              signal,
            );
            sent[index] = blob.size;
            partsDone += 1;
            report();
            break;
          } catch (error) {
            lastError = error;
            if (signal.aborted) throw error;
            // Retrying immediately usually fails the same way; a moment's
            // pause is often all a blip needs.
            sent[index] = 0;
            report();
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
          }
        }
        if (!etags[index]) throw lastError ?? new Error("A part failed");
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker),
    );
    if (signal.aborted) throw new Error("Upload cancelled");
    return etags;
  })();

  return {
    promise,
    abort: () => {
      signal.aborted = true;
      for (const xhr of signal.xhrs) xhr.abort();
    },
  };
}

/** Bytes, for a human staring at a progress bar. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
