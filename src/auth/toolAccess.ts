/**
 * Role rule for MCP tools.
 *
 * A tool is a WRITE tool when it runs Axon text that the caller gives, or when
 * it changes state that other users share (SkySpark records, the server
 * config, shared caches and indexes). A 'readonly' user cannot call a write
 * tool. A tool that is on no list is refused for a read-only user, so a new
 * tool is safe until it is placed.
 *
 * The two lists together name every tool of the dispatcher in src/index.ts
 * (toolAccess.test.ts checks this against the source).
 */
import type { UserRole } from '../admin/userStore.js';

export const WRITE_TOOLS: readonly string[] = [
  // Run Axon text from the caller on SkySpark
  'executeAxonCode',        // evalAxon(code) with no write guard
  'queryHaystack',          // the filter text goes into readAll(<filter>) as Axon
  'getProjectSchema',       // entityType and filter go into readAll(<text>) as Axon
  // Change SkySpark
  'commitAxonFunction',
  // Change state that all users share
  'saveProjectWorkflow',
  'clearProjectCache',
  'setPrimaryProject',
  'reauthenticateSkySparkProject',
  'discoverInstanceProjects', // can write the server config and build indexes
  'buildProjectGraph',
  'buildProjectEmbeddings',
];

export const READ_TOOLS: readonly string[] = [
  'searchAxonExamples', 'searchAxonOperatorExamples', 'searchAxonDocs', 'getAxonDoc', 'listAxonDocs',
  'listAxonCategories', 'listWorkflows', 'searchWorkflows', 'getWorkflowSummary', 'getAxonExample',
  'getAxonPattern', 'listAxonPatterns', 'findFunctionUsage', 'getFunctionExamples', 'getFunctionCallGraph',
  'getFunctionUsageStats', 'searchAxonRegex', 'listAxonTemplates',
  // The code is sent to SkySpark as a string for parseAst; it does not run.
  'generateAxonCode', 'validateAxonCode', 'parseAxonAst',
  'listSkySparkProjects',
  'switchSkySparkProject',    // changes only the caller's own session
  'discoverProjectFunctions', // fixed Axon; the name filter is applied on the server
  'getPrimaryProject',
  // Graph and search tools read the server's own database
  'getCallers', 'getCallees', 'getCodeImpact', 'findCodePath', 'getGraphMetrics', 'getMostCalledFunctions',
  'getMostComplexFunctions', 'detectCycles', 'queryGraph', 'findConstrainedPath',
  'getStronglyConnectedComponents', 'getPageRank', 'getBetweennessCentrality', 'exportGraphVisualization',
  'getGraphStats', 'semanticCodeSearch', 'findSimilarCode',
];

const READ = new Set(READ_TOOLS);

/**
 * The text of the refusal, or null when the call may go on. A call with no
 * role (no token, when MCP_REQUIRE_AUTH is off) has no rule here.
 */
export function toolDenied(tool: string, role: UserRole | undefined | null): string | null {
  if (role !== 'readonly') return null;
  if (READ.has(tool)) return null;
  return `Your user is read-only and cannot use ${tool}. Ask an admin for a user with the "user" role.`;
}
