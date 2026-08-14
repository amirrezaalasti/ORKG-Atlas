/**
 * Inline interactive components rendered from tool result envelopes:
 *  - InlineSparqlRunner: editable SPARQL editor + table of results
 *  - InlineChart: Recharts chart from a chart_spec envelope
 *  - InlineGraph: React Flow graph from a graph or statements envelope
 *  - StatementsTable: tabular view of an ORKG statements bundle
 */

import {
  Box,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Stack,
  Typography,
  Tooltip,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material';
import {
  ContentCopy,
  PlayArrow,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material';
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  Cell,
} from 'recharts';
import ReactFlow, {
  Background,
  Controls,
  Position,
  type Edge,
  type Node,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';
import { mcpApi } from '../../services/chatStreamClient';
import { resolveOrkgUriLink } from '../../utils/orkgResource';
import { truncateLabel } from '../../utils/chartUtils';
import BarChartPapersDialog from '../CustomCharts/BarChartPapersDialog';
import PreviewLink from './PreviewLink';
import { canOpenInChatPreview } from '../../utils/chatPreview';
import type {
  ChartSpec,
  GraphSpec,
  SparqlResults,
  ToolResultEnvelope,
} from '../../types/chat';

const CHART_COLORS = [
  '#e86161',
  '#43a047',
  '#fb8c00',
  '#8e24aa',
  '#e53935',
  '#00897b',
  '#3949ab',
  '#fdd835',
];

const cardSx = { borderRadius: 2, mb: 1.5 };

// ──────────────────────────────────────────────────────────────────────────────
// SPARQL runner
// ──────────────────────────────────────────────────────────────────────────────

interface InlineSparqlRunnerProps {
  initialResults: SparqlResults;
}

export const InlineSparqlRunner = ({
  initialResults,
}: InlineSparqlRunnerProps) => {
  const [query, setQuery] = useState(initialResults.query);
  const [results, setResults] = useState<SparqlResults>(initialResults);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuery, setShowQuery] = useState(false);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const env = (await mcpApi.callTool('orkg_sparql', {
        query,
      })) as ToolResultEnvelope<SparqlResults>;
      if (env.ok) setResults(env.data);
      else setError(env.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Chip size="small" label="SPARQL" variant="outlined" />
          <Typography variant="caption" color="text.secondary">
            {results.rows.length} rows
            {results.total > results.rows.length
              ? ` (truncated from ${results.total})`
              : ''}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={showQuery ? 'Hide query' : 'Edit query'}>
            <IconButton size="small" onClick={() => setShowQuery((v) => !v)}>
              {showQuery ? (
                <ExpandLess fontSize="small" />
              ) : (
                <ExpandMore fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy query">
            <IconButton
              size="small"
              onClick={() =>
                navigator.clipboard?.writeText(query).catch(() => undefined)
              }
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            variant="contained"
            startIcon={
              running ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <PlayArrow />
              )
            }
            onClick={onRun}
            disabled={running}
          >
            Run
          </Button>
        </Stack>
        {showQuery && (
          <TextField
            multiline
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minRows={4}
            maxRows={14}
            sx={{
              mb: 1,
              '& textarea': {
                fontFamily:
                  'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono","Courier New",monospace',
                fontSize: '0.85em',
              },
            }}
          />
        )}
        {error && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        <ResultsTable vars={results.vars} rows={results.rows} />
      </CardContent>
    </Card>
  );
};

const SparqlCellLink = ({ href, label }: { href: string; label: string }) => {
  if (canOpenInChatPreview(href)) {
    return (
      <PreviewLink
        href={href}
        underline="hover"
        variant="body2"
        component="span"
      >
        {label}
      </PreviewLink>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
};

const ResultsTable = ({
  vars,
  rows,
}: {
  vars: string[];
  rows: Array<Record<string, string>>;
}) => {
  if (rows.length === 0)
    return (
      <Typography variant="body2" color="text.secondary">
        No rows.
      </Typography>
    );
  const cols = vars.length > 0 ? vars : Object.keys(rows[0]);
  const truncated = rows.length > 100 ? rows.slice(0, 100) : rows;
  return (
    <Box
      sx={{
        maxHeight: 380,
        overflow: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: '0.85rem',
        }}
      >
        <thead style={{ position: 'sticky', top: 0 }}>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  borderBottom: '1px solid #ddd',
                  background: 'rgba(0,0,0,0.04)',
                  fontWeight: 600,
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {truncated.map((row, idx) => (
            <tr key={idx}>
              {cols.map((c) => (
                <td
                  key={c}
                  style={{
                    padding: '4px 8px',
                    borderBottom: '1px solid #eee',
                    fontFamily: row[c]?.startsWith('http')
                      ? 'inherit'
                      : 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
                    maxWidth: 360,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row[c]}
                >
                  {(() => {
                    const cell = row[c];
                    if (!cell) return null;
                    if (cell.startsWith('http')) {
                      const orkg = resolveOrkgUriLink(cell);
                      if (orkg) {
                        return (
                          <SparqlCellLink href={orkg.href} label={orkg.label} />
                        );
                      }
                      return <SparqlCellLink href={cell} label={cell} />;
                    }
                    return cell;
                  })()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > truncated.length && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ p: 1, display: 'block' }}
        >
          Showing first {truncated.length} of {rows.length} rows.
        </Typography>
      )}
    </Box>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Chart
// ──────────────────────────────────────────────────────────────────────────────

type ChartRow = Record<string, string | number | boolean | null | unknown>;

const chartTickFormatter = (dataLength: number) => {
  const maxLen = Math.max(
    6,
    Math.min(28, Math.floor(520 / Math.max(dataLength, 1)))
  );
  return (value: string) => truncateLabel(String(value), maxLen);
};

const getItemsInGroup = (row: ChartRow): Record<string, unknown>[] | null => {
  const raw = row.itemsInGroup;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.filter((x) => x && typeof x === 'object') as Record<
    string,
    unknown
  >[];
};

export const InlineChart = ({ spec }: { spec: ChartSpec }) => {
  const data = spec.data as ChartRow[];
  const [papersDialog, setPapersDialog] = useState<{
    open: boolean;
    barTitle: string;
    itemsInGroup: Record<string, unknown>[];
  }>({ open: false, barTitle: '', itemsInGroup: [] });
  const [detailRow, setDetailRow] = useState<{
    title: string;
    row: ChartRow;
  } | null>(null);

  const xTickFormatter = useMemo(
    () => chartTickFormatter(data.length),
    [data.length]
  );

  const onBarClick = (row: ChartRow) => {
    const label = String(row[spec.xKey] ?? '');
    const items = getItemsInGroup(row);
    if (items) {
      setPapersDialog({ open: true, barTitle: label, itemsInGroup: items });
      return;
    }
    setDetailRow({ title: label, row });
  };

  const chartHeight = spec.type === 'bar' ? 360 : 320;

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mb: 1 }}
          flexWrap="wrap"
        >
          <Chip size="small" label={`${spec.type} chart`} variant="outlined" />
          {spec.title && (
            <Typography variant="subtitle2">{spec.title}</Typography>
          )}
          {spec.type === 'bar' && (
            <Typography variant="caption" color="text.secondary">
              Click a bar for details
            </Typography>
          )}
        </Stack>
        <Box sx={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            {spec.type === 'bar' ? (
              <BarChart
                data={data}
                margin={{ top: 8, right: 16, left: 8, bottom: 56 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={spec.xKey}
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                  tickFormatter={xTickFormatter}
                  label={
                    spec.xLabel
                      ? {
                          value: spec.xLabel,
                          position: 'insideBottom',
                          offset: -4,
                        }
                      : undefined
                  }
                />
                <YAxis
                  label={
                    spec.yLabel
                      ? {
                          value: spec.yLabel,
                          angle: -90,
                          position: 'insideLeft',
                        }
                      : undefined
                  }
                />
                <RTooltip
                  labelFormatter={(label) => String(label)}
                  formatter={(value: number, name: string) => [value, name]}
                />
                <Legend />
                {spec.yKeys.map((y, i) => (
                  <Bar
                    key={y}
                    dataKey={y}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    stackId={spec.stacked ? 'stack' : undefined}
                    cursor="pointer"
                    radius={[4, 4, 0, 0]}
                    onClick={(barData) => {
                      const row = (
                        barData as { payload?: ChartRow } | undefined
                      )?.payload;
                      if (row) onBarClick(row);
                    }}
                  />
                ))}
              </BarChart>
            ) : spec.type === 'line' ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={spec.xKey} />
                <YAxis />
                <RTooltip />
                <Legend />
                {spec.yKeys.map((y, i) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={y}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : spec.type === 'area' ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={spec.xKey} />
                <YAxis />
                <RTooltip />
                <Legend />
                {spec.yKeys.map((y, i) => (
                  <Area
                    key={y}
                    type="monotone"
                    dataKey={y}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    fillOpacity={0.25}
                    stackId={spec.stacked ? 'stack' : undefined}
                  />
                ))}
              </AreaChart>
            ) : spec.type === 'scatter' ? (
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={spec.xKey} />
                <YAxis dataKey={spec.yKeys[0]} />
                <RTooltip />
                <Scatter data={data} fill={CHART_COLORS[0]} />
              </ScatterChart>
            ) : (
              <PieChart>
                <RTooltip />
                <Legend />
                <Pie
                  data={data}
                  dataKey={spec.yKeys[0]}
                  nameKey={spec.xKey}
                  outerRadius={120}
                  label
                >
                  {data.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        </Box>
      </CardContent>

      <BarChartPapersDialog
        open={papersDialog.open}
        onClose={() => setPapersDialog((d) => ({ ...d, open: false }))}
        barTitle={papersDialog.barTitle}
        itemsInGroup={papersDialog.itemsInGroup}
      />

      <Dialog
        open={detailRow != null}
        onClose={() => setDetailRow(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{detailRow?.title || 'Bar details'}</DialogTitle>
        <DialogContent dividers>
          {detailRow &&
            Object.entries(detailRow.row)
              .filter(([k]) => k !== 'itemsInGroup')
              .map(([key, value]) => (
                <Box
                  key={key}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, minWidth: 120 }}
                  >
                    {key}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {value == null
                      ? '—'
                      : typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value)}
                  </Typography>
                </Box>
              ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailRow(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Graph
// ──────────────────────────────────────────────────────────────────────────────

const layoutGraph = (nodes: Node[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 60 });
  nodes.forEach((n) => g.setNode(n.id, { width: 220, height: 48 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - 110, y: pos.y - 24 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
};

interface InlineGraphProps {
  spec?: GraphSpec;
  /** Statements bundle envelope variant. */
  statements?: {
    resourceId: string;
    statements: Array<{
      subject: { id: string; label?: string; _class?: string };
      predicate: { id: string; label?: string };
      object: { id: string; label?: string; _class?: string };
    }>;
    total?: number;
  };
}

export const InlineGraph = ({ spec, statements }: InlineGraphProps) => {
  const { nodes, edges, title } = useMemo(() => {
    if (spec) {
      const ns: Node[] = spec.nodes.map((n) => ({
        id: n.id,
        data: {
          label: (
            <Box sx={{ fontSize: '0.8rem', textAlign: 'center' }}>
              <Box sx={{ fontWeight: 600 }}>{n.label || n.id}</Box>
              {n.kind && <Box sx={{ color: 'text.secondary' }}>{n.kind}</Box>}
            </Box>
          ),
        },
        position: { x: 0, y: 0 },
        style: {
          background:
            n.kind === 'literal'
              ? '#fff8e1'
              : n.kind === 'predicate'
                ? '#e3f2fd'
                : n.kind === 'class'
                  ? '#f3e5f5'
                  : '#fff',
          border: '1px solid #bbb',
          borderRadius: 6,
          padding: 4,
        },
      }));
      const es: Edge[] = spec.edges.map((e, i) => ({
        id: `${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        labelBgPadding: [4, 2],
        labelBgStyle: { fill: '#fff', stroke: '#ccc' },
      }));
      return {
        nodes: layoutGraph(ns, es),
        edges: es,
        title: spec.rootLabel || spec.rootId,
      };
    }
    if (statements) {
      const seen = new Set<string>();
      const ns: Node[] = [];
      const es: Edge[] = [];
      const limit = Math.min(80, statements.statements.length);
      for (let i = 0; i < limit; i++) {
        const s = statements.statements[i];
        for (const node of [s.subject, s.object]) {
          if (!seen.has(node.id)) {
            seen.add(node.id);
            ns.push({
              id: node.id,
              data: {
                label: (
                  <Box sx={{ fontSize: '0.8rem', textAlign: 'center' }}>
                    <Box sx={{ fontWeight: 600 }}>{node.label || node.id}</Box>
                    <Box sx={{ color: 'text.secondary' }}>{node._class}</Box>
                  </Box>
                ),
              },
              position: { x: 0, y: 0 },
              style: {
                background: node._class === 'literal' ? '#fff8e1' : '#fff',
                border: '1px solid #bbb',
                borderRadius: 6,
                padding: 4,
              },
            });
          }
        }
        es.push({
          id: `${s.subject.id}-${s.predicate.id}-${s.object.id}-${i}`,
          source: s.subject.id,
          target: s.object.id,
          label: s.predicate.label || s.predicate.id,
          labelBgStyle: { fill: '#fff', stroke: '#ccc' },
        });
      }
      return {
        nodes: layoutGraph(ns, es),
        edges: es,
        title: statements.resourceId,
      };
    }
    return { nodes: [], edges: [], title: '' };
  }, [spec, statements]);

  if (nodes.length === 0) return null;

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent sx={{ pb: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" label="Knowledge graph" variant="outlined" />
          <Typography variant="subtitle2">{title}</Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {nodes.length} nodes · {edges.length} edges
          </Typography>
        </Stack>
        <Box sx={{ width: '100%', height: 380, mt: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            panOnScroll
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </Box>
      </CardContent>
    </Card>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Statements (table view)
// ──────────────────────────────────────────────────────────────────────────────

interface StatementsTableProps {
  resourceId: string;
  statements: Array<{
    subject: { id: string; label?: string };
    predicate: { id: string; label?: string };
    object: { id: string; label?: string; _class?: string };
  }>;
  total?: number;
}

export const StatementsTable = ({
  resourceId,
  statements,
  total,
}: StatementsTableProps) => {
  const [showAll, setShowAll] = useState(false);
  const sliced = showAll ? statements : statements.slice(0, 25);
  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Chip size="small" label="Statements" variant="outlined" />
          <Typography variant="subtitle2">{resourceId}</Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Showing {sliced.length} of {statements.length}
            {total && total !== statements.length ? ` (total ${total})` : ''}
          </Typography>
        </Stack>
        <Box
          sx={{
            maxHeight: 360,
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
            }}
          >
            <thead
              style={{
                position: 'sticky',
                top: 0,
                background: 'rgba(0,0,0,0.04)',
              }}
            >
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                  Subject
                </th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                  Predicate
                </th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                  Object
                </th>
              </tr>
            </thead>
            <tbody>
              {sliced.map((s, i) => (
                <tr key={i}>
                  <td
                    style={{
                      padding: '4px 8px',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    {s.subject.label ?? s.subject.id}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      borderBottom: '1px solid #eee',
                      color: '#e86161',
                    }}
                  >
                    {s.predicate.label ?? s.predicate.id}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    {s.object.label ?? s.object.id}
                    {s.object._class === 'literal' && (
                      <Chip size="small" label="literal" sx={{ ml: 1 }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        {statements.length > 25 && (
          <Button
            size="small"
            onClick={() => setShowAll((v) => !v)}
            sx={{ mt: 1 }}
          >
            {showAll ? 'Collapse' : `Show all ${statements.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
