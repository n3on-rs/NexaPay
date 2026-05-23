#!/bin/sh
# Ensure data directories are writable before starting (volume mounts
# may be owned by root). Only attempts chown if running as root (which
# won't happen with USER nexapay — the chmod approach is used instead).
[ -d /app/chain_data ] && chmod 777 /app/chain_data 2>/dev/null || true
[ -d /app/chain_state ] && chmod 777 /app/chain_state 2>/dev/null || true
exec "$@"
