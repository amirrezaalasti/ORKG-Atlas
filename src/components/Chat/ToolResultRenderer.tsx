/**
 * Dispatches a tool result envelope to the matching inline component.
 *
 * The chat page calls this for each completed tool call. Errors render an
 * inline error card; "ok" envelopes are routed by `render` kind to one of the
 * card / inline components. Unknown kinds fall back to a JSON preview.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import { ContentCopy, ExpandLess, ExpandMore } from '@mui/icons-material';
import type {
  ToolResultEnvelope,
  ChartSpec,
  GraphSpec,
  SparqlResults,
} from '../../types/chat';
import {
  PaperCard,
  ResourceCard,
  ComparisonCard,
  TemplateCard,
  StatsCard,
  AskSynthesisCard,
  DynamicQuestionsCard,
} from './cards';
import {
  InlineSparqlRunner,
  InlineChart,
  InlineGraph,
  StatementsTable,
} from './inline';

interface PaperList {
  items: Array<Parameters<typeof PaperCard>[0]['paper']>;
  total?: number;
  page?: number;
}

interface ResourceList {
  items: Array<Parameters<typeof ResourceCard>[0]['resource']>;
  total?: number;
  page?: number;
}

interface ComparisonList {
  items: Array<Parameters<typeof ComparisonCard>[0]['comparison']>;
}

interface StatementsBundle {
  resourceId: string;
  statements: Array<{
    subject: { id: string; label?: string; _class?: string };
    predicate: { id: string; label?: string };
    object: { id: string; label?: string; _class?: string };
  }>;
  total?: number;
}

interface JsonPreviewProps {
  data: unknown;
}

const JsonPreview = ({ data }: JsonPreviewProps) => {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(data, null, 2);
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, mb: 1.5 }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Chip size="small" label="Tool result" variant="outlined" />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Copy JSON">
            <IconButton
              size="small"
              onClick={() =>
                navigator.clipboard?.writeText(json).catch(() => undefined)
              }
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => setOpen((v) => !v)}>
            {open ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </IconButton>
        </Stack>
        {open && (
          <Box
            component="pre"
            sx={{
              backgroundColor: 'action.hover',
              p: 1.5,
              borderRadius: 1,
              overflow: 'auto',
              fontSize: '0.78rem',
              maxHeight: 360,
              m: 0,
            }}
          >
            {json}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

interface Props {
  result: ToolResultEnvelope;
  toolName?: string;
}

const ToolResultRenderer = ({ result, toolName }: Props) => {
  if (!result.ok) {
    return (
      <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
        <strong>{toolName || 'Tool'}:</strong> {result.error}
      </Alert>
    );
  }

  switch (result.render) {
    case 'paper':
      return (
        <PaperCard
          paper={result.data as Parameters<typeof PaperCard>[0]['paper']}
        />
      );

    case 'papers': {
      const data = result.data as PaperList;
      return (
        <Stack spacing={0}>
          {data.items.map((p) => (
            <PaperCard key={p.id} paper={p} />
          ))}
          {(data.total ?? data.items.length) > data.items.length && (
            <Typography variant="caption" color="text.secondary">
              Showing {data.items.length} of {data.total} results.
            </Typography>
          )}
        </Stack>
      );
    }

    case 'resource':
      return (
        <ResourceCard
          resource={
            result.data as Parameters<typeof ResourceCard>[0]['resource']
          }
        />
      );

    case 'resources': {
      const data = result.data as ResourceList;
      return (
        <Stack spacing={0}>
          {data.items.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </Stack>
      );
    }

    case 'comparison':
      return (
        <ComparisonCard
          comparison={
            result.data as Parameters<typeof ComparisonCard>[0]['comparison']
          }
        />
      );

    case 'comparisons': {
      const data = result.data as ComparisonList;
      return (
        <Stack spacing={0}>
          {data.items.map((c) => (
            <ComparisonCard key={c.id} comparison={c} />
          ))}
        </Stack>
      );
    }

    case 'template':
      return (
        <TemplateCard
          template={
            result.data as Parameters<typeof TemplateCard>[0]['template']
          }
        />
      );

    case 'statements': {
      const bundle = result.data as StatementsBundle;
      return (
        <Stack spacing={0}>
          <StatementsTable {...bundle} />
          {bundle.statements.length > 0 && bundle.statements.length <= 80 && (
            <InlineGraph statements={bundle} />
          )}
        </Stack>
      );
    }

    case 'sparql_results':
      return (
        <InlineSparqlRunner initialResults={result.data as SparqlResults} />
      );

    case 'chart_spec':
      return <InlineChart spec={result.data as ChartSpec} />;

    case 'graph':
      return <InlineGraph spec={result.data as GraphSpec} />;

    case 'stats':
      return (
        <StatsCard
          data={result.data as Parameters<typeof StatsCard>[0]['data']}
        />
      );

    case 'dynamic_questions':
      return (
        <DynamicQuestionsCard
          items={
            (
              result.data as {
                items: Parameters<typeof DynamicQuestionsCard>[0]['items'];
              }
            ).items
          }
        />
      );

    case 'ask_synthesis': {
      const d = result.data as { question: string; synthesis: string };
      return <AskSynthesisCard question={d.question} synthesis={d.synthesis} />;
    }

    case 'text':
    default:
      return <JsonPreview data={result.data} />;
  }
};

export default ToolResultRenderer;
