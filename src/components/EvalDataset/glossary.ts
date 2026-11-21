/** Plain-language names for the evaluation sets, question kinds, and run configurations. */

export const SETS: Record<string, string> = {
  sampled:
    '109 questions over 40 templates drawn from the ORKG catalogue (seed 2027). A template was eligible when it had a usable schema and at least 10 papers, was outside the curated and out-of-domain sets, and did not share a schema family with another draw. Questions and gold SPARQL are generated from the template and its instance profile.',
  curated:
    '26 questions behind the dashboards Atlas ships with: Empirical Research Practice and NLP4RE. The gold SPARQL is the query for each dashboard chart, executed and frozen against the ORKG triplestore.',
  ood: '20 questions on five templates Atlas is not given template-specific guidance for, including psychology and ecology. They were written from the live graph, and the prompt contains no guidance text for these templates.',
  stress:
    '44 questions built for three hard cases: the paper reaches the described instance along an unusual route, the asked property is declared but unused while a similarly named predicate is the one papers actually use (mismatch), or the asked property is never stated, so the correct answer is empty.',
  empty:
    '10 questions whose correct answer on the live graph is an empty table or a zero count. The filter matches nothing, the property is absent, or the count of matching papers is zero.',
};

export const KINDS: Record<string, string> = {
  attr: 'Asks for the value of a property on the template itself, one hop from the paper’s contribution.',
  count:
    'Asks how many distinct values of a property each paper reports. The gold query counts them.',
  nested:
    'Asks for a property of a sub-template, two hops from the contribution.',
  filter:
    'Same shape as an attribute question, kept only for papers whose other property has one given value.',
  unused:
    'Asks for a property the template declares and no paper states. The correct answer is an empty table.',
  mismatch:
    'The label points at a declared property nobody uses, while papers state a different predicate with a similar name. Gold follows the predicate that is used.',
  route:
    'The paper reaches the instance through a path other than the direct contribution link, so the query has to follow that route.',
  'impossible-filter':
    'The filter cannot match any paper in the graph, so the gold table is empty.',
  'absent-property':
    'The question asks for a property that no contribution in this template states.',
  'zero-count':
    'The question asks for a count, and the number of matching papers is zero.',
};

export const CONFIGS: Record<string, string> = {
  full: 'Atlas as it is deployed: the predicate map, nested properties, the paper-to-contribution link, template guidance, the validator, and up to three repair attempts.',
  'no-nesting': 'Full, with nested properties left out of the prompt.',
  'no-link':
    'Full, without the pattern that links a paper to its contribution.',
  'no-validator':
    'Full, and a query the validator rejects is kept instead of being sent back with the validator’s hints.',
  'no-repair': 'Full with a single attempt. There is no repair step.',
  'no-guidance': 'Full, without the template-specific guidance text.',
  'repair-empty':
    'Full, and a query that runs but returns no rows is sent back for repair.',
  'no-schema':
    'A plain instruction to write SPARQL. The prompt has no template schema, and there is one attempt.',
  'raw-schema':
    'The reachable template definitions as JSON, with a plain instruction. No predicate map, paper-link convention, guidance, or validator.',
  'schema-dump':
    'The same JSON template definitions as raw schema, plus the paper-link pattern and Full’s output convention: select the paper, return labels rather than ids, and do not aggregate.',
  'shacl-shapes':
    'Those template definitions written as SHACL shapes in Turtle, together with the schema-dump conventions.',
  'matched-json':
    'Full’s prompt, with the predicate map replaced by the same template definitions in JSON.',
  'matched-shacl':
    'Full’s prompt, with the predicate map replaced by the same template definitions as SHACL.',
  profiled:
    'Full, plus the instance profile: the most common paper-to-instance route, and which declared predicates papers actually use.',
  'profiled-route': 'Full, plus only that most common route.',
  'profiled-usage':
    'Full, plus only the counts of declared predicates against the ones papers use.',
  'profiled-oracle-routes':
    'Profiled, plus every paper-to-instance route observed in the RDF dump, written as a UNION.',
  'react-explore':
    'No schema up front. The model may run up to eight exploratory SPARQL queries, then write the answer query.',
  'validator-only':
    'The prompt has no schema. The validator still checks the query and can ask for a repair.',
  'claude-code':
    'Claude Code answers from the Atlas tools over MCP, outside the pipeline: no predicate-map prompt and no repair loop.',
  'cursor-agent':
    'Cursor’s agent answers from the Atlas tools over MCP, outside the pipeline: no predicate-map prompt and no repair loop.',
};

export const explainSet = (id: string): string | null => SETS[id] ?? null;

export const explainKind = (id: string): string | null => KINDS[id] ?? null;

export const explainConfig = (id: string): string =>
  CONFIGS[id] ?? 'A run configuration stored with the evaluation results.';
