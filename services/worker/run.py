"""Run the worker.

It polls Convex for jobs. There is no Redis and no arq any more: those existed
because FastAPI put work into a queue, and FastAPI is going away. Convex
cannot reach into a container, so the container asks.
"""

from worker.loop import main

if __name__ == "__main__":
    main()
