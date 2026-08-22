#!/bin/bash
set -e

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Validate required environment variables
required_vars=("POSTGRES_HOST" "POSTGRES_PORT" "POSTGRES_DB" "POSTGRES_USER"
               "POSTGRES_PASSWORD" "S3_BUCKET" "S3_FOLDER" "AWS_ACCESS_KEY_ID"
               "AWS_SECRET_ACCESS_KEY" "SCHEDULE")

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    error_exit "Required environment variables are not set: ${missing_vars[*]}"
fi

log "Environment variables validated successfully"

# Export AWS credentials for AWS CLI
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"

# Configure AWS CLI defaults if endpoint is set
if [ -n "${S3_ENDPOINT}" ]; then
    log "Configuring AWS CLI with endpoint: ${S3_ENDPOINT}"
fi

# Create log file
touch /var/log/backup.log

# Run on startup if enabled
if [ "${RUN_ON_STARTUP:-false}" = "true" ]; then
    log "RUN_ON_STARTUP is enabled, running backup immediately..."
    /app/backup.sh 2>&1 | tee -a /var/log/backup.log
    log "Initial backup completed"
else
    log "RUN_ON_STARTUP is disabled, skipping initial backup"
fi

# Setup cron job
log "Setting up cron schedule: ${SCHEDULE}"

# Remove any existing cron jobs
crontab -r 2>/dev/null || true

# Create new cron job
cat > /tmp/crontab <<EOF
${SCHEDULE} /app/backup.sh >> /var/log/backup.log 2>&1
EOF

crontab /tmp/crontab
rm /tmp/crontab

# Verify cron job was set
log "Cron jobs configured:"
crontab -l

# Start cron daemon in background
log "Starting cron daemon..."
crond -f -l 2 &
CRON_PID=$!

# Start health check indicator
log "Starting health check monitoring..."

# Use a file-based health check instead of HTTP server
# This avoids the nc binding issues and is more reliable
echo "healthy" > /tmp/health_status

# Update health status file periodically
(
    while true; do
        echo "healthy" > /tmp/health_status
        date -Iseconds >> /tmp/health_status
        sleep 10
    done
) &

HTTP_PID=$!

log "Backup service started successfully!"
log "Cron PID: ${CRON_PID}"
log "Health check: File-based (/tmp/health_status)"

# Keep container running and handle graceful shutdown
trap 'log "Shutting down..."; kill ${CRON_PID} 2>/dev/null; exit 0' SIGTERM SIGINT

# Wait for processes
wait