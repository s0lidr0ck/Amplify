/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: `output: 'standalone'` was removed when the web app moved to Vercel.
  // It bundles a self-contained server for a container image, which Vercel's
  // builder cannot use — it looks for per-route lambdas that standalone mode
  // never emits and fails with "Unable to find lambda for route: ...".
  //
  // Put it back if this app is ever containerised again. The API and the
  // FFmpeg/Whisper worker still run in containers; only this app moved.
};

module.exports = nextConfig;
