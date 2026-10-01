-- CreateTable
CREATE TABLE "user_project_scopes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL DEFAULT '',
    "instance" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "user_project_scopes_user_id_idx" ON "user_project_scopes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_project_scopes_user_id_client_id_key" ON "user_project_scopes"("user_id", "client_id");
