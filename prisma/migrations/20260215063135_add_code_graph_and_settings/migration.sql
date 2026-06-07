-- CreateTable
CREATE TABLE "axon_projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "function_count" INTEGER NOT NULL DEFAULT 0,
    "last_indexed" DATETIME,
    "auto_index" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "code_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" INTEGER NOT NULL,
    "node_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qualified_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "line_start" INTEGER NOT NULL,
    "line_end" INTEGER,
    "signature" TEXT,
    "documentation" TEXT,
    "return_type" TEXT,
    "source" TEXT,
    "modifiers" TEXT,
    "facets" TEXT,
    "parent_type" TEXT,
    "is_public" BOOLEAN,
    "is_static" BOOLEAN,
    "is_abstract" BOOLEAN,
    "language" TEXT DEFAULT 'axon',
    CONSTRAINT "code_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "axon_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "code_edges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "edge_type" TEXT NOT NULL,
    "line_number" INTEGER,
    "col_number" INTEGER,
    "is_resolved" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "code_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "code_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "code_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "code_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "unresolved_refs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" INTEGER NOT NULL,
    "from_node_id" TEXT NOT NULL,
    "reference_name" TEXT NOT NULL,
    "ref_type" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "col_number" INTEGER,
    "candidates" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "graph_build_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" INTEGER NOT NULL,
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "unresolved_count" INTEGER NOT NULL DEFAULT 0,
    "vector_count" INTEGER NOT NULL DEFAULT 0,
    "last_build_at" DATETIME,
    "last_vector_at" DATETIME,
    "build_duration_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "axon_projects_name_key" ON "axon_projects"("name");

-- CreateIndex
CREATE INDEX "code_nodes_project_id_idx" ON "code_nodes"("project_id");

-- CreateIndex
CREATE INDEX "code_nodes_name_idx" ON "code_nodes"("name");

-- CreateIndex
CREATE INDEX "code_nodes_node_type_idx" ON "code_nodes"("node_type");

-- CreateIndex
CREATE UNIQUE INDEX "code_nodes_project_id_qualified_name_key" ON "code_nodes"("project_id", "qualified_name");

-- CreateIndex
CREATE INDEX "code_edges_source_id_idx" ON "code_edges"("source_id");

-- CreateIndex
CREATE INDEX "code_edges_target_id_idx" ON "code_edges"("target_id");

-- CreateIndex
CREATE INDEX "code_edges_edge_type_idx" ON "code_edges"("edge_type");

-- CreateIndex
CREATE UNIQUE INDEX "code_edges_source_id_target_id_edge_type_line_number_key" ON "code_edges"("source_id", "target_id", "edge_type", "line_number");

-- CreateIndex
CREATE INDEX "unresolved_refs_project_id_idx" ON "unresolved_refs"("project_id");

-- CreateIndex
CREATE INDEX "unresolved_refs_from_node_id_idx" ON "unresolved_refs"("from_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "graph_build_stats_project_id_key" ON "graph_build_stats"("project_id");
