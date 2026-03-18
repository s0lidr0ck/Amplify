"""Run the ARQ worker."""

import asyncio
from arq import run_worker

from worker.main import WorkerSettings

if __name__ == "__main__":
    # Python 3.10+ requires an event loop to exist before run_worker creates the Worker
    # (Worker.__init__ calls asyncio.get_event_loop()). Set it explicitly.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        run_worker(WorkerSettings)
    finally:
        loop.close()
