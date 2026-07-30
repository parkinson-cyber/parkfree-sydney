# Sandboxes the council data-fetch scripts only (fetch-*.py / fetch-*.mjs) —
# not the Expo app itself, which can't usefully run in a Mac container anyway.
# These scripts hit ~13 external council/government sites; running them here
# keeps that fetch surface off the host filesystem.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1001 fetcher
WORKDIR /app/scripts

COPY --chown=fetcher:fetcher . .
RUN mkdir -p data && chown -R fetcher:fetcher /app

USER fetcher

# Run one script at a time, e.g.:
#   docker compose run --rm fetch python3 fetch-northsydney-parking.py
#   docker compose run --rm fetch node fetch-cbd-parking.mjs
CMD ["bash"]
