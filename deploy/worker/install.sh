#!/usr/bin/env bash
#
# Put the Amplify worker on a fresh Ubuntu box.
#
# Safe to run more than once: every step checks before it acts, so a second
# run repairs rather than duplicates. Run it with sudo.
#
#   sudo ./install.sh
#
# Afterwards you must put the shared secret in /etc/amplify-worker/worker.env
# and start the service. The script deliberately does not take the secret as
# an argument — it would end up in your shell history and in ps output.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/amplify-worker/src}"
APP_DIR=/opt/amplify-worker
STATE_DIR=/var/lib/amplify-worker
CONF_DIR=/etc/amplify-worker
SERVICE=amplify-worker

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

say "1/6  Packages"
# ffmpeg does the cutting, ffprobe reports real durations, yt-dlp pulls a
# service down from YouTube. python3-venv is separate from python3 on Ubuntu
# and its absence is the usual first failure.
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip ffmpeg yt-dlp ca-certificates git

say "2/6  User and directories"
if ! id amplify >/dev/null 2>&1; then
  # No shell and no home worth logging into: this account exists to run one
  # process, and nothing should ever sign in as it.
  useradd --system --shell /usr/sbin/nologin --home "$STATE_DIR" amplify
fi
install -d -o amplify -g amplify "$APP_DIR" "$STATE_DIR"
install -d -m 0750 -o root -g amplify "$CONF_DIR"

say "3/6  Python environment"
if [ ! -d "$APP_DIR/venv" ]; then
  python3 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/venv/bin/pip" install --quiet -r "$REPO_DIR/services/worker/requirements.txt"

# CUDA, if there is a card. faster-whisper reaches these through
# LD_LIBRARY_PATH rather than a system CUDA install — the same arrangement
# the AutoQC worker on this box already proved, so both are wrong or right
# together instead of failing in different ways.
GPU_LIBS=""
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  say "     GPU found — installing CUDA runtime libraries"
  "$APP_DIR/venv/bin/pip" install --quiet     nvidia-cublas-cu12 nvidia-cuda-nvrtc-cu12     nvidia-cuda-runtime-cu12 nvidia-cudnn-cu12
  SP="$APP_DIR/venv/lib/python3.*/site-packages/nvidia"
  GPU_LIBS=$(printf '%s' "$(echo $SP/cublas/lib):$(echo $SP/cuda_nvrtc/lib):$(echo $SP/cuda_runtime/lib):$(echo $SP/cudnn/lib)")
  WHISPER_DEVICE=cuda
  WHISPER_COMPUTE=float16
else
  say "     No GPU — the worker will transcribe on CPU"
  WHISPER_DEVICE=cpu
  WHISPER_COMPUTE=int8
fi

say "4/6  Worker code"
# Copied rather than symlinked, so a half-finished git pull cannot swap the
# code out from under a running transcription.
rsync -a --delete \
  --exclude '__pycache__' --exclude '*.pyc' \
  "$REPO_DIR/services/worker/" "$APP_DIR/"
chown -R amplify:amplify "$APP_DIR"

say "5/6  Configuration"
if [ ! -f "$CONF_DIR/worker.env" ]; then
  cat > "$CONF_DIR/worker.env" <<'ENV'
# Where the worker asks for work. The .site host serves HTTP routes; .cloud
# serves functions and will 404 here.
HUB_URL=https://hushed-chinchilla-210.convex.site

# Shared with the Convex deployment. Get it from the deployment with
#   npx convex env get AMPLIFY_WORKER_SECRET
# and paste it below. The worker refuses to start without it rather than
# polling silently and 401ing forever.
AMPLIFY_WORKER_SECRET=

# Which Whisper model, and on what.
#
# Measured on this box (RTX PRO 2000, 78-second clip, warm):
#   small     30.8x realtime   ~1.3 min for a 40-minute sermon
#   medium    19.5x realtime   ~2.1 min
#   large-v3   7.7x realtime   ~5.2 min
#
# large-v3 is four times slower and still finishes a sermon in five minutes,
# which is nothing for something that happens once a week. It earns that on
# accuracy: on the test clip `medium` heard "God is holding" where the
# preacher said "God is holy and" — a sentence that means nothing, in a
# published blog post. It also punctuates properly, which matters when the
# output is prose rather than captions.
#
# Re-measure before changing it:
#   /opt/amplify-worker/venv/bin/python bench_whisper.py <a real sermon>
WHISPER_MODEL=large-v3
WHISPER_DEVICE=__DEVICE__
WHISPER_COMPUTE_TYPE=__COMPUTE__
LD_LIBRARY_PATH=__GPULIBS__
ENV
  sed -i "s|__DEVICE__|$WHISPER_DEVICE|; s|__COMPUTE__|$WHISPER_COMPUTE|; s|__GPULIBS__|$GPU_LIBS|"     "$CONF_DIR/worker.env"
  chmod 0640 "$CONF_DIR/worker.env"
  chown root:amplify "$CONF_DIR/worker.env"
  echo "  wrote $CONF_DIR/worker.env — the secret is still blank"
else
  echo "  $CONF_DIR/worker.env already exists, left alone"
fi

say "6/6  Service"
install -m 0644 "$REPO_DIR/deploy/worker/amplify-worker.service" \
  /etc/systemd/system/$SERVICE.service
systemctl daemon-reload
systemctl enable $SERVICE >/dev/null

cat <<'DONE'

Installed. Two things left, both yours:

  1. Put the secret in /etc/amplify-worker/worker.env
       sudo nano /etc/amplify-worker/worker.env

  2. Start it and watch the first poll
       sudo systemctl start amplify-worker
       journalctl -u amplify-worker -f

A healthy worker logs "polling ... for trim, transcribe, youtube_import"
and then says nothing until there is work. Silence is the normal state.
DONE
