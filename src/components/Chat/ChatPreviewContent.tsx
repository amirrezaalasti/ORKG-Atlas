/**
 * Native ORKG preview (orkg.org sets X-Frame-Options, so iframe embedding is blocked).
 * Loads entities via MCP tools and reuses chat card components.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { mcpApi } from '../../services/chatStreamClient';
import type { ToolResultEnvelope } from '../../types/chat';
import { parseOrkgPreviewUrl } from '../../utils/chatPreview';
import { PaperCard, ResourceCard, ComparisonCard, TemplateCard } from './cards';
import { InlineGraph, StatementsTable } from './inline';

interface ChatPreviewContentProps {
  url: string;
}

const ChatPreviewContent = ({ url }: ChatPreviewContentProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<ToolResultEnvelope | null>(null);
  const [statements, setStatements] = useState<{
    resourceId: string;
    statements: Array<{
      subject: { id: string; label?: string; _class?: string };
      predicate: { id: string; label?: string };
      object: { id: string; label?: string; _class?: string };
    }>;
    total?: number;
  } | null>(null);

  const parsed = useMemo(() => parseOrkgPreviewUrl(url), [url]);

  useEffect(() => {
    let cancelled = false;
    const p = parseOrkgPreviewUrl(url);

    const run = async () => {
      setLoading(true);
      setError(null);
      setEnvelope(null);
      setStatements(null);

      if (!p) {
        setError('Could not parse this ORKG link.');
        setLoading(false);
        return;
      }

      if (p.kind === 'ask_item') {
        setLoading(false);
        return;
      }

      try {
        let toolName: string;
        let args: Record<string, string>;
        switch (p.kind) {
          case 'paper':
            toolName = 'orkg_get_paper';
            args = { id: p.id };
            break;
          case 'comparison':
            toolName = 'orkg_get_comparison';
            args = { id: p.id };
            break;
          case 'template':
            toolName = 'orkg_get_template';
            args = { id: p.id };
            break;
          case 'resource':
          case 'unknown':
          default:
            toolName = 'orkg_get_resource';
            args = { id: p.id };
            break;
        }

        const result = await mcpApi.callTool(toolName, args);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setLoading(false);
          return;
        }
        setEnvelope(result);

        if (p.kind === 'paper' || p.kind === 'resource') {
          const bundle = await mcpApi.callTool('orkg_get_statements_bundle', {
            resourceId: p.id,
            maxLevel: 3,
            sample: 80,
          });
          if (!cancelled && bundle.ok && bundle.render === 'statements') {
            setStatements(
              bundle.data as {
                resourceId: string;
                statements: Array<{
                  subject: { id: string; label?: string; _class?: string };
                  predicate: { id: string; label?: string };
                  object: { id: string; label?: string; _class?: string };
                }>;
                total?: number;
              }
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (parsed?.kind === 'ask_item') {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          ORKG Ask items cannot be embedded here (the Ask site blocks iframes).
          Open the full item in ORKG Ask to explore citations and synthesis.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Item ID: <strong>{parsed.id}</strong>
        </Typography>
        <Button
          variant="contained"
          startIcon={<OpenInNew />}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          component="a"
        >
          Open in ORKG Ask
        </Button>
      </Stack>
    );
  }

  if (loading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ flex: 1, py: 6 }}
      >
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading from ORKG…
        </Typography>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<OpenInNew />}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          component="a"
        >
          Open on orkg.org
        </Button>
      </Stack>
    );
  }

  if (!envelope?.ok) {
    return null;
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflowY: 'auto',
        p: 1.5,
        '& .MuiCard-root': { mb: 1 },
      }}
    >
      {envelope.render === 'paper' && (
        <PaperCard
          paper={envelope.data as Parameters<typeof PaperCard>[0]['paper']}
        />
      )}
      {envelope.render === 'resource' && (
        <ResourceCard
          resource={
            envelope.data as Parameters<typeof ResourceCard>[0]['resource']
          }
        />
      )}
      {envelope.render === 'comparison' && (
        <ComparisonCard
          comparison={
            envelope.data as Parameters<typeof ComparisonCard>[0]['comparison']
          }
        />
      )}
      {envelope.render === 'template' && (
        <TemplateCard
          template={
            envelope.data as Parameters<typeof TemplateCard>[0]['template']
          }
        />
      )}

      {statements && statements.statements.length > 0 && (
        <Stack spacing={0} sx={{ mt: 1 }}>
          <StatementsTable {...statements} />
          {statements.statements.length <= 80 && (
            <InlineGraph statements={statements} />
          )}
        </Stack>
      )}

      <Button
        size="small"
        startIcon={<OpenInNew />}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        component="a"
        sx={{ mt: 1 }}
      >
        Open full page on orkg.org
      </Button>
    </Box>
  );
};

export default ChatPreviewContent;
