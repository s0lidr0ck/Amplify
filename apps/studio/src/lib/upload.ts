/**
 * Putting a sermon into S3 from the browser.
 *
 * XMLHttpRequest rather than fetch, for one reason: fetch cannot report
 * upload progress. A sermon is gigabytes over a church's broadband, and a
 * button that says nothing for twenty minutes is a button people press again.
 *
 * The bytes go straight to S3. They never pass through Convex, and there is
 * no API server in the middle to hold them.
 */

export type UploadProgress = {
  /** 0–100, or null before the first byte is acknowledged. */
  percent: number | null;
  loaded: number;
  total: number;
};

export function uploadToS3(
  url: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url, true);
    // S3 signs the content type, so it has to match what was signed.
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      onProgress({
        percent: e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null,
        loaded: e.loaded,
        total: e.lengthComputable ? e.total : file.size,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // S3 explains itself in an XML body. Surfacing the code beats "upload
      // failed", which tells the person nothing they can act on.
      const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText)?.[1];
      reject(
        new Error(
          code
            ? `S3 refused the upload (${code})`
            : `S3 refused the upload (HTTP ${xhr.status})`,
        ),
      );
    };

    xhr.onerror = () =>
      reject(new Error("The connection dropped during the upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    xhr.send(file);
  });

  return { promise, abort: () => xhr.abort() };
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
