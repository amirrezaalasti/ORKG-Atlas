import {
  Box,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { Close, OpenInNew, ChevronRight } from '@mui/icons-material';
import { useChatPreview } from '../../context/ChatPreviewContext';
import ChatPreviewContent from './ChatPreviewContent';
import ChatLiveBrowser from './ChatLiveBrowser';

const ChatPreviewPanel = () => {
  const theme = useTheme();
  const {
    preview,
    closePreview,
    previewMode,
    setPreviewMode,
    liveBrowserAvailable,
    updatePreviewTitle,
  } = useChatPreview();

  if (!preview) return null;

  return (
    <Box
      sx={{
        width: { xs: 'min(100%, 420px)', md: '46%' },
        maxWidth: 900,
        minWidth: 320,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: alpha(theme.palette.background.paper, 0.9),
          backdropFilter: 'blur(8px)',
        }}
      >
        <ChevronRight sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography
          variant="subtitle2"
          noWrap
          sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}
          title={preview.title}
        >
          {preview.title}
        </Typography>
        <Tooltip title="Open in new tab">
          <IconButton
            size="small"
            component="a"
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close preview">
          <IconButton
            size="small"
            onClick={closePreview}
            aria-label="Close preview"
          >
            <Close fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Tabs
        value={previewMode}
        onChange={(_, v) => setPreviewMode(v)}
        variant="fullWidth"
        sx={{
          minHeight: 40,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 40, py: 0.5, fontSize: '0.8rem' },
        }}
      >
        <Tab
          value="live"
          label="Live browser"
          disabled={!liveBrowserAvailable}
        />
        <Tab value="summary" label="ORKG data" />
      </Tabs>

      <Box
        sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {previewMode === 'live' && liveBrowserAvailable ? (
          <ChatLiveBrowser
            key={preview.url}
            url={preview.url}
            onTitleChange={updatePreviewTitle}
          />
        ) : (
          <ChatPreviewContent url={preview.url} />
        )}
      </Box>
    </Box>
  );
};

export default ChatPreviewPanel;
