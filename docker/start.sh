#!/bin/sh
set -eu
PORT="${PORT:-10000}"
case "$PORT" in ''|*[!0-9]*) echo "Invalid PORT" >&2; exit 1 ;; esac
# Render assigns a port through $PORT; Apache must listen on it.
sed -i -E "s/^Listen [0-9]+$/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i -E "s@<VirtualHost \*:[0-9]+>@<VirtualHost *:${PORT}>@" /etc/apache2/sites-available/000-default.conf
exec apache2-foreground
