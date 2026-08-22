#!/bin/bash
set -e

# Configuration
S3_BACKUP_PATH="${1}"
TARGET_DATABASE="${2:-${POSTGRES_DB}}"
LOCAL_BACKUP_PATH="/tmp/backups/restore.sql.gz"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Show usage if no arguments provided
if [ -z "$1" ]; then
    echo "Usage: $0 <s3-backup-path> [target-database]"
    echo ""
    echo "Examples:"
    echo "  $0 s3://my-bucket/backups/backup_20230601_020000.sql.gz"
    echo "  $0 s3://my-bucket/backups/backup_20230601_020000.sql.gz my_database"
    echo "  $0 backup_20230601_020000.sql.gz (for local files)"
    echo ""
    echo "Environment variables required:"
    echo "  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD"
    echo "  S3_BUCKET, S3_FOLDER, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    echo "  S3_ENDPOINT (optional)"
    exit 1
fi

# Validate required environment variables
required_vars=("POSTGRES_HOST" "POSTGRES_PORT" "POSTGRES_USER" "POSTGRES_PASSWORD")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        error_exit "Required environment variable ${var} is not set"
    fi
done

# Detect if input is S3 path or local file
if [[ "$1" == s3://* ]]; then
    # S3 download
    log "Downloading backup from S3..."
    log "Source: ${S3_BACKUP_PATH}"

    if [ -n "${S3_ENDPOINT}" ]; then
        ENDPOINT_URL="--endpoint-url=${S3_ENDPOINT}"
        log "Using S3 endpoint: ${S3_ENDPOINT}"
    else
        ENDPOINT_URL=""
    fi

    aws s3 cp "${S3_BACKUP_PATH}" "${LOCAL_BACKUP_PATH}" \
        ${ENDPOINT_URL} \
        --region "${S3_REGION:-us-east-1}" \
        || error_exit "Failed to download backup from S3"

    SOURCE_FILE="${LOCAL_BACKUP_PATH}"
else
    # Local file
    SOURCE_FILE="$1"
    log "Using local backup file: ${SOURCE_FILE}"
fi

# Check if source file exists
if [ ! -f "${SOURCE_FILE}" ]; then
    error_exit "Source file not found: ${SOURCE_FILE}"
fi

# Detect compression type
case "${SOURCE_FILE}" in
    *.gz)
        DECOMPRESS="pigz -d -c"
        log "Detected compression: gzip (using pigz)"
        ;;
    *.zst)
        DECOMPRESS="zstd -d -c"
        log "Detected compression: zstd"
        ;;
    *)
        DECOMPRESS="cat"
        log "No compression detected"
        ;;
esac

# Wait for PostgreSQL to be ready
log "Checking PostgreSQL connectivity..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
           -U "${POSTGRES_USER}" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
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

# Check if target database exists, if not create it
log "Checking if database '${TARGET_DATABASE}' exists..."
DB_EXISTS=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DATABASE}'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    log "Creating database '${TARGET_DATABASE}'..."
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${TARGET_DATABASE};" \
        || error_exit "Failed to create database"
else
    log "Database '${TARGET_DATABASE}' exists"
fi

# Drop existing connections to the target database
log "Dropping existing connections to '${TARGET_DATABASE}'..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DATABASE}' AND pid <> pg_backend_pid();" \
    || log "WARNING: Failed to drop existing connections (may not be critical)"

# Restore database
log "Starting database restore..."
log "Target database: ${TARGET_DATABASE}"

${DECOMPRESS} "${SOURCE_FILE}" | \
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" -d "${TARGET_DATABASE}" \
    || error_exit "Database restore failed"

# Cleanup
if [ -f "${LOCAL_BACKUP_PATH}" ]; then
    rm -f "${LOCAL_BACKUP_PATH}"
    log "Local backup file cleaned up"
fi

log "Database restore completed successfully!"
log "Restored database: ${TARGET_DATABASE}"

# Verify restore
log "Verifying restore..."
TABLE_COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" -d "${TARGET_DATABASE}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")

log "Database contains ${TABLE_COUNT} tables"