/**
 * External tool access policy over the shared registry. Internal callers keep
 * using the registry directly; a future external adapter must use this policy.
 */
import {
  fail,
  externalToolExecutionFailure,
  toolRegistry,
  type ToolContext,
  type ToolResult,
} from './registry.js';
import { EXTERNAL_CATALOG_LIMITS, MCP_TOOL_LIMITS } from '../../config/mcp.js';

const externalToolNames = new Set<string>([
  'orkg_sparql_schema',
  'orkg_sparql',
  'orkg_get_resource',
  'orkg_search_resources',
  'orkg_get_paper',
  'orkg_search_papers',
  'orkg_get_statements_bundle',
  'orkg_get_statements_by_subject',
  'orkg_get_comparison',
  'orkg_search_comparisons',
  'orkg_get_template',
  'orkg_search_templates',
  'atlas_list_templates',
  'orkg_build_graph',
  'render_chart',
  'render_graph',
]);

const externalVisualizationDescriptions: Record<string, string> = {
  orkg_build_graph: `Fetch an ORKG statements bundle and return a graph specification with rootId, rootLabel, nodes and edges. Processes up to maxStatements (default ${MCP_TOOL_LIMITS.defaultGraphStatements}, maximum ${MCP_TOOL_LIMITS.maxGraphStatements}). meta reports totalStatements, returnedStatements and truncation within the fetched bundle. Rendering is the responsibility of the client.`,
  render_chart: `Return a structured chart specification with type, axes, series keys and data (maximum ${MCP_TOOL_LIMITS.maxChartRows} rows and ${MCP_TOOL_LIMITS.maxChartSeries} series). Numeric strings in yKeys are normalized to finite numbers; non-finite numeric values are rejected. Rendering is the responsibility of the client.`,
  render_graph: `Return a structured graph specification with rootId, optional rootLabel, nodes (maximum ${MCP_TOOL_LIMITS.maxGraphNodes}) and edges (maximum ${MCP_TOOL_LIMITS.maxGraphEdges}). Use for explicitly supplied graph data; use orkg_build_graph to retrieve ORKG statements. Rendering is the responsibility of the client.`,
};

export function listExternalTools(_ctx: ToolContext) {
  return toolRegistry
    .list({ includeAdmin: false })
    .filter((tool) => externalToolNames.has(tool.name))
    .map((tool) => {
      if (externalVisualizationDescriptions[tool.name])
        return {
          ...tool,
          description: externalVisualizationDescriptions[tool.name],
        };
      if (
        tool.name !== 'orkg_search_templates' &&
        tool.name !== 'atlas_list_templates'
      )
        return tool;
      return {
        ...tool,
        description: `${tool.name === 'orkg_search_templates' ? 'Search public ORKG catalog templates by a non-empty query.' : 'List public ORKG catalog templates, optionally filtered by query.'} ${tool.name === 'atlas_list_templates' ? `By default (all=false), returns one ORKG page. all=true fetches sequential pages starting at page, with size as the page size, bounded by ${EXTERNAL_CATALOG_LIMITS.maxPages} pages, ${EXTERNAL_CATALOG_LIMITS.maxItems} templates, ${EXTERNAL_CATALOG_LIMITS.maxBytes / 1_000_000} MB of aggregated items and ${EXTERNAL_CATALOG_LIMITS.timeoutMs / 1000} seconds total. Check truncated, stopReason and continuation; completion means catalog end reached from the requested start page, not a consistent snapshot. Continuation preserves the query and size; do not infer full-catalog counts from partial results.` : 'Returns one ORKG page only;'} no Atlas-only or Firestore templates or metadata. page defaults to 0, size to ${MCP_TOOL_LIMITS.defaultPageSize} (maximum ${MCP_TOOL_LIMITS.maxPageSize}). total is omitted when unknown. Use orkg_get_template or orkg_sparql_schema for details.`,
      };
    });
}

export async function callExternalTool(
  name: string,
  args: unknown,
  _ctx: ToolContext
): Promise<ToolResult> {
  if (!externalToolNames.has(name)) {
    return fail(`Tool ${name} is not available for external MCP access`);
  }
  try {
    // External calls never inherit identity, attribution or administrator rights.
    return await toolRegistry.call(name, args, {
      isAdmin: false,
      externalMcp: true,
    });
  } catch {
    // Also covers failures before the registry's handler catch (e.g. parsing).
    return externalToolExecutionFailure();
  }
}
