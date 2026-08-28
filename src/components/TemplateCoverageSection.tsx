import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SchemaIcon from '@mui/icons-material/Schema';
import ScienceIcon from '@mui/icons-material/Science';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import HubIcon from '@mui/icons-material/Hub';
import StatCard from './StatCard';
import GaugeChart from './GaugeChart';
import { useTemplateCoverage } from '../hooks/useTemplateCoverage';
import { buildCoverageTableRows } from '../services/templateCoverage';
import { MotionStack, staggerContainer } from '../constants/motion';
import { useRevealMotion } from '../hooks/useRevealMotion';
import { brandColors } from '../constants/brandColors';

const ACCENT = brandColors.primary.main;

export default function TemplateCoverageSection() {
  const { result, fetchedAt, loading, progress, error, refresh } =
    useTemplateCoverage();
  const reveal = useRevealMotion();
  const progressValue =
    progress && progress.total > 0
      ? Math.min(100, (progress.loaded / progress.total) * 100)
      : loading
        ? undefined
        : 0;

  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3, mt: 6 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        mb={2}
      >
        <Box>
          <Typography variant="h6" gutterBottom>
            ORKG catalogue coverage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live schema-resolution over every public ORKG template — the same
            walk Atlas uses at runtime to decide whether a template yields a
            usable schema.
          </Typography>
          {fetchedAt && !loading && (
            <Typography variant="caption" color="text.secondary">
              As of {new Date(fetchedAt).toLocaleString()}
            </Typography>
          )}
        </Box>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<RefreshIcon />}
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {loading && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress
            variant={
              progress && progress.total > 0 ? 'determinate' : 'indeterminate'
            }
            value={progressValue}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: '#e0e0e0',
              '& .MuiLinearProgress-bar': { backgroundColor: ACCENT },
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: 'block' }}
          >
            {progress && progress.total > 0
              ? `Fetching templates ${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()}`
              : 'Fetching ORKG templates…'}
          </Typography>
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={refresh}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {result && (
        <>
          <Stack
            direction="row"
            flexWrap="wrap"
            spacing={3}
            useFlexGap
            mb={3}
            justifyContent="center"
          >
            <Box sx={{ width: { xs: '100%', sm: 280 } }}>
              <GaugeChart
                label="Usable schemas"
                value={result.yield_usable_schema}
                max={result.n_templates}
                color={ACCENT}
              />
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 280 } }}>
              <GaugeChart
                label="Nested templates"
                value={result.reference_other_template}
                max={result.n_templates}
                color={ACCENT}
              />
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 280 } }}>
              <GaugeChart
                label="Target class declared"
                value={result.declare_target_class}
                max={result.n_templates}
                color={ACCENT}
              />
            </Box>
          </Stack>

          <MotionStack
            {...reveal}
            variants={staggerContainer}
            direction="row"
            flexWrap="wrap"
            spacing={{ xs: 2, md: 3 }}
            useFlexGap
            mb={4}
            justifyContent={{ xs: 'center', md: 'flex-start' }}
          >
            <StatCard value={result.n_templates} label="Templates">
              <SchemaIcon sx={{ fontSize: 40, color: '#c0392b' }} />
            </StatCard>
            <StatCard value={result.n_research_fields} label="Research fields">
              <ScienceIcon sx={{ fontSize: 40, color: '#c0392b' }} />
            </StatCard>
            <StatCard
              value={result.reference_other_template}
              label="Nested templates"
            >
              <AccountTreeIcon sx={{ fontSize: 40, color: '#c0392b' }} />
            </StatCard>
            <StatCard
              value={result.largest_expansion_size}
              label="Largest expansion"
            >
              <HubIcon sx={{ fontSize: 40, color: '#c0392b' }} />
            </StatCard>
          </MotionStack>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Schema-resolution breakdown
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Metric</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell sx={{ width: { xs: 120, sm: 220 } }}>
                    Share of catalogue
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {buildCoverageTableRows(result).map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell>{row.metric}</TableCell>
                    <TableCell align="right">{row.value}</TableCell>
                    <TableCell>
                      {row.share !== undefined ? (
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, row.share)}
                            sx={{
                              width: '100%',
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: '#e0e0e0',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: ACCENT,
                              },
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{ ml: 1, minWidth: 48 }}
                          >
                            {row.share.toFixed(1)}%
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );
}
