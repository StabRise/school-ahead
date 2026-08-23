#!/bin/bash
set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
HOSTNAME=$(hostname)

# Include hostname in backup filename if enabled
if [ "${BACKUP_INCLUDE_HOSTNAME:-false}" = "true" ]; then
    BACKUP_FILENAME="backup_${HOSTNAME}_${TIMESTAMP}.sql.gz"
else
    BACKUP_FILENAME="backup_${TIMESTAMP}.sql.gz"
fi

LOCAL_BACKUP_PATH="/tmp/backups/${BACKUP_FILENAME}"
# "backup" is the mc alias entrypoint.sh configures for S3_ENDPOINT (or AWS
# S3 if unset) — see entrypoint.sh.
S3_BACKUP_PATH="backup/${S3_BUCKET}/${S3_FOLDER}/${BACKUP_FILENAME}"

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
               "AWS_SECRET_ACCESS_KEY")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        error_exit "Required environment variable ${var} is not set"
    fi
done

# Set compression command
COMPRESSION_CMD=${COMPRESSION:-pigz}
case "$COMPRESSION_CMD" in
    pigz)
        COMPRESS="pigz -p 4"
        ;;
    gzip)
        COMPRESS="gzip"
        ;;
    zstd)
        COMPRESS="zstd -3"
        BACKUP_FILENAME="backup_${TIMESTAMP}.sql.zst"
        LOCAL_BACKUP_PATH="/tmp/backups/${BACKUP_FILENAME}"
        S3_BACKUP_PATH="backup/${S3_BUCKET}/${S3_FOLDER}/${BACKUP_FILENAME}"
        ;;
    *)
        log "WARNING: Unknown compression '${COMPRESSION_CMD}', defaulting to pigz"
        COMPRESS="pigz -p 4"
        ;;
esac

log "Starting backup process..."
log "Database: ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT}"
log "Compression: ${COMPRESSION_CMD}"
log "Backup filename: ${BACKUP_FILENAME}"
if [ "${BACKUP_INCLUDE_HOSTNAME:-false}" = "true" ]; then
    log "Hostname included: ${HOSTNAME}"
fi
log "Local path: ${LOCAL_BACKUP_PATH}"
log "S3 path: ${S3_BACKUP_PATH}"

# Wait for PostgreSQL to be ready
log "Checking PostgreSQL connectivity..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
           -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "SELECT 1" > /dev/null 2>&1; then
        log "PostgreSQL is ready!"
        break
    fi
    attempt=$((attempt + 1))
    log "Waiting for PostgreSQL... (attempt ${attempt}/${max_attempts})"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    error_exit "PostgreSQL is not ready after ${max_attempts} attempts"
fi

# Create backup
log "Creating database dump..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --verbose --no-owner --no-acl \
    | ${COMPRESS} > "${LOCAL_BACKUP_PATH}" || error_exit "Backup creation failed"

log "Backup created successfully: ${LOCAL_BACKUP_PATH}"
backup_size=$(du -h "${LOCAL_BACKUP_PATH}" | cut -f1)
log "Backup size: ${backup_size}"

# Upload to S3
log "Uploading to S3..."
mc cp "${LOCAL_BACKUP_PATH}" "${S3_BACKUP_PATH}" || error_exit "S3 upload failed"
log "Upload completed successfully!"

# Cleanup old backups. mc's own --older-than does this correctly in one
# call — no manual date parsing needed.
if [ -n "${BACKUP_KEEP_DAYS}" ]; then
    log "Cleaning up backups older than ${BACKUP_KEEP_DAYS} days..."
    mc rm --recursive --force --older-than "${BACKUP_KEEP_DAYS}d" "backup/${S3_BUCKET}/${S3_FOLDER}/" \
        || log "WARNING: Old backup cleanup failed"
    log "Old backup cleanup completed"
fi

# Cleanup local backup
rm -f "${LOCAL_BACKUP_PATH}"
log "Local backup file cleaned up"

log "Backup process completed successfully!"