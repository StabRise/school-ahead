#!/bin/bash
#
# PostgreSQL Backup Restoration Examples
# =========================================
# This script provides documentation and examples for restoring PostgreSQL backups.
#
# Usage: ./restore-example.sh
#

cat <<'EOF'
========================================
PostgreSQL Backup Restoration Guide
========================================

## Quick Start

### Option 1: Restore within running backup container

```bash
# List available backups in S3
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  aws s3 ls s3://your-bucket/your-folder/ --endpoint-url=https://your-endpoint

# Restore specific backup
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  /app/restore.sh s3://your-bucket/your-folder/backup_20230601_020000.sql.gz
```

### Option 2: Run one-off restore container

```bash
# Start temporary restore container
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod run --rm db-backup \
  /app/restore.sh s3://your-bucket/your-folder/backup_20230601_020000.sql.gz target_database
```

### Option 3: Manual restoration with Docker

```bash
# Download backup from S3 first
aws s3 cp s3://your-bucket/your-folder/backup_20230601_020000.sql.gz ./backup.sql.gz \
  --endpoint-url=https://your-endpoint

# Restore using PostgreSQL container
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec -T db \
  psql -U lago -d lago < <(pigz -d -c ./backup.sql.gz)
```

## Environment Variables Required

For all restoration methods, ensure these environment variables are set:

```bash
# Database connection
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=lago
POSTGRES_USER=lago
POSTGRES_PASSWORD=your_password

# S3/AWS credentials
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT=https://s3.amazonaws.com  # Your S3 endpoint
S3_REGION=us-east-1
```

## Restoration Examples by Scenario

### 1. Restore to Original Database (Overwrites Existing)

```bash
/app/restore.sh s3://bucket/folder/backup_20230601_020000.sql.gz
```

### 2. Restore to New Database (Preserves Original)

```bash
/app/restore.sh s3://bucket/folder/backup_20230601_020000.sql.gz lago_restore
```

### 3. Restore from Local File

```bash
# Copy backup to container first
docker compose cp ./backup.sql.gz lago-db-backup:/tmp/backup.sql.gz

# Restore from local file
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  /app/restore.sh /tmp/backup.sql.gz lago_restore
```

## Common Issues and Solutions

### Issue: "Database is being accessed by other users"
**Solution**: The restore script automatically drops existing connections, but you may need to stop the application first:

```bash
# Stop Lago API and workers temporarily
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod stop api api-worker

# Perform restore
# ... restore commands ...

# Restart services
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod start api api-worker
```

### Issue: "Role does not exist"
**Solution**: The backup script uses `--no-owner --no-acl` flags, but if you need to preserve ownership, ensure the user exists:

```bash
# Create user if needed
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db \
  psql -U postgres -c "CREATE USER lago WITH PASSWORD 'your_password';"
```

### Issue: "Decompression failed"
**Solution**: Verify the compression type matches the file extension:

```bash
# For .gz files: uses pigz automatically
# For .zst files: uses zstd automatically

# If unsure, decompress manually first:
pigz -d -c backup.sql.gz | docker compose exec -T db psql -U lago -d lago
```

### Issue: S3 authentication errors
**Solution**: Verify credentials and endpoint:

```bash
# Test S3 access first
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  aws s3 ls s3://your-bucket/ --endpoint-url=https://your-endpoint
```

## Verification After Restoration

Always verify the restoration was successful:

```bash
# Check table count
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db \
  psql -U lago -d lago -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Check specific important tables
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db \
  psql -U lago -d lago -c "\dt"

# Run application-level checks
curl http://localhost:3003/health
```

## Backup Rotation and Cleanup

The backup script automatically cleans up old backups based on `BACKUP_KEEP_DAYS`:

```bash
# In .env.lago.prod
POSTGRES_BACKUP_KEEP_DAYS=30  # Keeps last 30 days of backups
```

To manually list and delete old backups:

```bash
# List backups with dates
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  aws s3 ls s3://bucket/folder/ --endpoint-url=https://your-endpoint

# Delete specific backup
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  aws s3 rm s3://bucket/folder/backup_old.sql.gz --endpoint-url=https://your-endpoint
```

## Advanced: Automated Restore Testing

For production systems, consider automating restore tests:

```bash
#!/bin/bash
# This could be run weekly to verify backup integrity

# 1. Download latest backup
LATEST_BACKUP=$(aws s3 ls s3://bucket/folder/ --endpoint-url=endpoint | tail -1 | awk '{print $2}')
aws s3 cp "s3://bucket/folder/${LATEST_BACKUP}" ./test_backup.sql.gz

# 2. Restore to test database
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db-backup \
  /app/restore.sh ./test_backup.sql.gz lago_test

# 3. Verify restore
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db \
  psql -U lago -d lago_test -c "SELECT COUNT(*) FROM organizations;" > /tmp/restore_test.log

# 4. Cleanup
docker compose -f lago/docker-compose.lago.yml --env-file lago/.env.lago.prod exec db \
  psql -U postgres -c "DROP DATABASE lago_test;"
```

========================================

For more information, see:
- Backup script: /app/backup.sh
- Restore script: /app/restore.sh
- Docker Compose: lago/docker-compose.lago.yml
- Environment: lago/.env.lago.example

========================================
EOF
