import { beforeEach, expect, it, vi } from 'vitest';
import { EXTERNAL_MCP_LIMITS, PUBLIC_SPARQL_LIMITS } from '../config/mcp.js';
import { loadTemplateFlow } from './orkg/templateFlow.js';
import { sparqlQuery } from './orkg/orkgClient.js';
import {
  discoverPaperLinkPath,
  generateDynamicSPARQLPrompt,
  generateTemplateMapping,
} from '../../../shared/promptGenerator.js';
import { buildTemplateScopeBanner } from './sparqlTemplateValidation.js';
import { getCanonicalSparqlExamples } from '../config/templateSparqlQueries.js';
import {
  buildExternalSparqlSchemaPrompt,
  buildSparqlSchemaPrompt,
} from './sparqlPromptService.js';

vi.mock('./orkg/templateFlow.js', () => ({ loadTemplateFlow: vi.fn() }));
vi.mock('./orkg/orkgClient.js', () => ({ sparqlQuery: vi.fn() }));
vi.mock('../../../shared/promptGenerator.js', () => ({
  discoverPaperLinkPath: vi.fn(),
  generateDynamicSPARQLPrompt: vi.fn(),
  generateTemplateMapping: vi.fn(),
}));
vi.mock('./sparqlTemplateValidation.js', () => ({
  buildTemplateScopeBanner: vi.fn(),
}));
vi.mock('../config/templateSparqlQueries.js', () => ({
  getCanonicalSparqlExamples: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadTemplateFlow).mockResolvedValue({
    templates: [
      {
        id: 'R1',
        label: 'Research',
        target_class: { id: 'C1', label: 'Class' },
        properties: [],
      },
    ],
    targetClassId: 'C1',
    warnings: ['A hierarchy branch is unresolved.'],
  });
  vi.mocked(generateTemplateMapping).mockReturnValue({});
});

it('never performs live discovery for external guidance, even without an execution scope', async () => {
  const result = await buildExternalSparqlSchemaPrompt('R1', ' question ');
  expect(loadTemplateFlow).toHaveBeenCalledWith('R1', {
    reportIncomplete: true,
    externalMcp: true,
  });
  expect(discoverPaperLinkPath).not.toHaveBeenCalled();
  expect(sparqlQuery).not.toHaveBeenCalled();
  expect(result.warnings).toContain('A hierarchy branch is unresolved.');
  expect(result.warnings?.join(' ')).toContain(
    'Paper-to-template path could not be established'
  );
  expect(result.sparqlPrompt).toContain(
    `SELECT LIMIT ${PUBLIC_SPARQL_LIMITS.minSelectLimit}–${PUBLIC_SPARQL_LIMITS.maxSelectLimit}`
  );
  expect(result.sparqlPrompt).toContain(
    `Public query budget: ${PUBLIC_SPARQL_LIMITS.maxQueryBytes}`
  );
  expect(result.sparqlPrompt).toContain(
    `Schema invocation deadline ${EXTERNAL_MCP_LIMITS.schemaTimeoutMs} ms`
  );
  expect(result.sparqlPrompt).toContain(
    'No verified paper-to-template pattern is available.'
  );
  expect(result.sparqlPrompt).toContain('## Research question\nquestion');
});

it('keeps unresolved target classes explicit', async () => {
  vi.mocked(loadTemplateFlow).mockResolvedValue({
    templates: [
      { id: 'R1', label: 'Research', target_class: { id: '', label: '' } },
    ],
  });
  const result = await buildExternalSparqlSchemaPrompt('R1');
  expect(result.targetClassId).toBeUndefined();
  expect(result.warnings?.join(' ')).toContain(
    'Target class could not be established'
  );
  expect(discoverPaperLinkPath).not.toHaveBeenCalled();
});

it('rejects an unavailable root instead of inventing a schema', async () => {
  vi.mocked(loadTemplateFlow).mockResolvedValue({ templates: [] });
  await expect(buildExternalSparqlSchemaPrompt('R1')).rejects.toThrow(
    'Requested template is unavailable'
  );
});

it('preserves the internal prompt generation, discovery, examples and question replacement', async () => {
  const path = [['P1']];
  vi.mocked(discoverPaperLinkPath).mockResolvedValue(path);
  vi.mocked(generateDynamicSPARQLPrompt).mockReturnValue(
    'body [Research Question]'
  );
  vi.mocked(buildTemplateScopeBanner).mockReturnValue('banner ');
  vi.mocked(getCanonicalSparqlExamples).mockReturnValue(' examples');
  const result = await buildSparqlSchemaPrompt('R1', ' question ');
  expect(loadTemplateFlow).toHaveBeenCalledWith('R1');
  expect(discoverPaperLinkPath).toHaveBeenCalledWith(
    'C1',
    expect.any(Function)
  );
  expect(buildTemplateScopeBanner).toHaveBeenCalledWith({
    templateId: 'R1',
    targetClassId: 'C1',
    templateLabel: 'Research',
    paperLinkPath: path,
  });
  expect(generateDynamicSPARQLPrompt).toHaveBeenCalledWith(
    {},
    'R1',
    'Research',
    'C1',
    path
  );
  expect(result.sparqlPrompt).toBe('banner body question examples');
  expect(result).not.toHaveProperty('warnings');
});
