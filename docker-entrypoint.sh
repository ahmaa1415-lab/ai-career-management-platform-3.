#!/bin/sh
set -e

# Railway mounts persistent volumes as root.
# Ensure the volume directory and its subdirectories are owned by nextjs (uid 1001)
if [ -d "/app/data" ]; then
  chown -R nextjs:nodejs /app/data 2>/dev/null || true
  chmod -R 775 /app/data 2>/dev/null || true
fi

# Hand off execution to nextjs user using gosu
exec gosu nextjs "$@"
