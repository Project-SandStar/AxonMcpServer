-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "expires_at" DATETIME,
    "last_used_at" DATETIME,
    "last_used_from" TEXT,
    "revoked_at" DATETIME,
    "revoked_by" TEXT
);

-- CreateTable
CREATE TABLE "access_audit_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "user_id" TEXT,
    "username" TEXT,
    "key_id" TEXT,
    "key_prefix" TEXT,
    "instance" TEXT,
    "project" TEXT,
    "name" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_prefix_key" ON "user_api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_token_hash_key" ON "user_api_keys"("token_hash");

-- CreateIndex
CREATE INDEX "user_api_keys_user_id_idx" ON "user_api_keys"("user_id");

-- CreateIndex
CREATE INDEX "access_audit_events_at_idx" ON "access_audit_events"("at");

-- CreateIndex
CREATE INDEX "access_audit_events_user_id_idx" ON "access_audit_events"("user_id");
