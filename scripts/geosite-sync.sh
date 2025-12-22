#!/bin/sh

PID_FILE="/opt/var/run/geosite-sync.pid"
LOG_FILE="/opt/var/log/geosite-sync.log"

mkdir -p /opt/var/run /opt/var/log

if [ -f "$PID_FILE" ]; then
	pid="$(cat "$PID_FILE")"
	if kill -0 "$pid" 2>/dev/null; then
		echo "geosite-sync already running (pid $pid)"
		exit 0
	else
		rm -f "$PID_FILE"
	fi
fi

/opt/bin/node /opt/keenetic-geosite-sync/index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
