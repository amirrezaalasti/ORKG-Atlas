import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Breadcrumbs,
  Link,
  useTheme as useMuiTheme,
  useMediaQuery,
  Tooltip,
  Badge,
  Button,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import GitHubIcon from '@mui/icons-material/GitHub';
import BookIcon from '@mui/icons-material/Book';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ApiIcon from '@mui/icons-material/Api';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AssignmentIcon from '@mui/icons-material/Assignment';
import {
  useLocation,
  Link as RouterLink,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { queries } from '../constants/queries_chart_info';
import LoginORKG from './LoginORKG';
import { templateConfig } from '../constants/template_config';
import { useState, useEffect, useMemo } from 'react';
import CRUDHomeContent, { Template } from '../firestore/CRUDHomeContent';
import { listAllOrkgTemplatesAsAtlasTemplates } from '../services/orkgTemplatesApi';
import TemplatePickerDialog from './TemplatePickerDialog';
import { toast } from 'react-hot-toast';
import CRUDNews from '../firestore/CRUDNews';
import SettingsIcon from '@mui/icons-material/Settings';
import BackupSelector from './BackupSelector';
import BackupService from '../services/BackupService';
import { useBackupChange } from '../hooks/useBackupChange';
import { getSnapshotColors } from '../constants/brandColors';

interface HeaderProps {
  handleDrawerOpen: () => void;
}

const Header = ({ handleDrawerOpen }: HeaderProps) => {
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const location = useLocation();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [catalogSource, setCatalogSource] = useState<
    'orkg' | 'home_content' | 'default'
  >('default');
  const [orkgApiTotalElements, setOrkgApiTotalElements] = useState<
    number | null
  >(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('R186491');
  const [highPriorityNewsCount, setHighPriorityNewsCount] = useState<number>(0);
  const { templateId } = useParams<{ templateId: string }>();
  const [backupSelectorOpen, setBackupSelectorOpen] = useState(false);
  const [currentBackupName, setCurrentBackupName] = useState<string>('');
  const backupVersion = useBackupChange(); // Listen for backup changes

  useEffect(() => {
    const name = BackupService.isExplicitlyUsingBackup()
      ? BackupService.getCurrentBackupName()
      : '';
    setCurrentBackupName(name || ''); // Clear if no backup
  }, [backupVersion]); // Re-run when backup changes

  /** Full ORKG template catalog for the dropdown; Firebase list is fallback if the API fails. */
  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      try {
        const { templates: orkgTemplates, totalElementsReported } =
          await listAllOrkgTemplatesAsAtlasTemplates();
        if (!cancelled && orkgTemplates.length > 0) {
          setTemplates(orkgTemplates);
          setCatalogSource('orkg');
          setOrkgApiTotalElements(totalElementsReported);
          return;
        }
      } catch (err) {
        console.warn('Failed to load ORKG template catalog:', err);
      }

      try {
        const content = await CRUDHomeContent.getHomeContent();
        if (cancelled) return;
        if (content.templates && content.templates.length > 0) {
          setTemplates(content.templates);
          setCatalogSource('home_content');
          setOrkgApiTotalElements(null);
        } else {
          setTemplates(CRUDHomeContent.defaultHomeContent.templates);
          setCatalogSource('default');
          setOrkgApiTotalElements(null);
        }
      } catch {
        if (!cancelled) {
          setTemplates(CRUDHomeContent.defaultHomeContent.templates);
          setCatalogSource('default');
          setOrkgApiTotalElements(null);
        }
      }
    };
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [currentBackupName]);

  const templatesForSelect = useMemo(() => {
    const map = new Map(templates.map((t) => [t.id, t]));
    const tid = templateId || selectedTemplate;
    if (tid && /^R\d+$/.test(tid) && !map.has(tid)) {
      map.set(tid, { id: tid, title: tid });
    }
    return [...map.values()].sort((a, b) =>
      (a.title || a.id).localeCompare(b.title || b.id, undefined, {
        sensitivity: 'base',
      })
    );
  }, [templates, templateId, selectedTemplate]);

  // Fetch high priority news count
  useEffect(() => {
    const fetchHighPriorityNewsCount = async () => {
      try {
        const items = await CRUDNews.getAllNews(true); // Only published news
        const highPriorityCount = items.filter(
          (item) => item.priority === 'high'
        ).length;
        setHighPriorityNewsCount(highPriorityCount);
      } catch (err) {
        console.error('Error fetching high priority news count:', err);
        // Don't show error to user, just set count to 0
        setHighPriorityNewsCount(0);
      }
    };
    fetchHighPriorityNewsCount();
  }, []); // Run only on mount

  // Keep header selection in sync with URL for any ORKG resource id segment
  useEffect(() => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const templateFromUrl = pathSegments[0];
    if (templateFromUrl && /^R\d+$/.test(templateFromUrl)) {
      setSelectedTemplate(templateFromUrl);
    }
  }, [location.pathname]);

  const applyTemplateSelection = (newTemplate: string) => {
    setSelectedTemplate(newTemplate);
    const choice = templatesForSelect.find((t) => t.id === newTemplate);
    const label =
      choice?.title ?? templateConfig[newTemplate]?.title ?? newTemplate;
    toast.success(`Theme changed to ${label}`);

    if (location.pathname.startsWith('/chat')) {
      navigate(`/${newTemplate}/`);
      setTemplatePickerOpen(false);
      return;
    }

    const pathSegments = location.pathname.split('/').filter(Boolean);
    pathSegments[0] = newTemplate;
    navigate(`/${pathSegments.join('/')}`);
    setTemplatePickerOpen(false);
  };

  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [];

    if (paths[0] === 'chat') {
      const template = templatesForSelect.find(
        (t) => t.id === selectedTemplate
      );
      const templateName =
        template?.title || templateConfig[selectedTemplate]?.title || 'Home';
      breadcrumbs.push({
        path: `/${selectedTemplate}/`,
        label: templateName,
      });
      breadcrumbs.push({ path: '/chat', label: 'AI Chat' });
      if (paths[1] === 'share') {
        breadcrumbs.push({
          path: location.pathname,
          label: 'Shared conversation',
        });
      }
      return breadcrumbs;
    }

    if (paths.length > 0) {
      // Add template name as first breadcrumb
      const templateId = paths[0];
      const template = templatesForSelect.find((t) => t.id === templateId);
      const templateName =
        template?.title || templateConfig[templateId]?.title || 'Theme';
      breadcrumbs.push({
        path: `/${templateId}/`,
        label: templateName,
      });

      // Add remaining path segments
      paths.slice(1).forEach((path, index) => {
        const actualIndex = index + 1; // Actual index in paths array
        const fullPath = '/' + paths.slice(0, index + 2).join('/');
        let label = path.charAt(0).toUpperCase() + path.slice(1);

        // Handle specific route names
        if (path === 'allquestions') {
          label = `All Questions`;
        } else if (path === 'statistics') {
          label = 'Statistics';
        } else if (path === 'team') {
          label = 'Team';
        } else if (path === 'dynamic-question') {
          label = 'Dynamic Question';
        } else if (path === 'community-questions') {
          label = 'Community Questions';
        } else if (path === 'news') {
          label = 'News';
        } else if (path === 'schema') {
          label = 'Schema';
        } else if (path === 'questions') {
          // Show 'All Questions' for the questions segment
          label = 'All Questions';
          // If there's a question ID after, adjust the path to point to allquestions
          if (paths[actualIndex + 1]) {
            const adjustedPath =
              '/' + paths.slice(0, actualIndex).join('/') + '/allquestions';
            breadcrumbs.push({ path: adjustedPath, label });
            return; // Skip adding the actual questions path, we'll handle the ID next
          }
        } else if (actualIndex > 0 && paths[actualIndex - 1] === 'questions') {
          // This is a question ID following 'questions'
          const questionId = parseInt(path);
          const question = queries.find((q) => q.id === questionId);
          if (question) {
            label = `Question ${questionId}`;
          } else {
            label = `Question ${path}`;
          }
        } else if (actualIndex > 0 && paths[actualIndex - 1] === 'news') {
          // Keep news item identifiers readable in breadcrumbs
          label = 'News Details';
        }

        breadcrumbs.push({ path: fullPath, label });
      });
    }

    return breadcrumbs;
  };
  const redirectToGitHub = () => {
    window.open('https://github.com/amirrezaalasti/ORKG-Atlas/', '_blank');
  };

  const redirectToStorybook = () => {
    window.open(
      'https://empire-compass-storybook.tib.eu/?path=/docs/layout-dashboard--docs',
      '_blank'
    );
  };

  const redirectToArchitecture = () => {
    // Navigate to the in-app JSON schema view
    const paths = location.pathname.split('/').filter(Boolean);
    const templateId = paths[0] || 'R186491';
    window.location.href = `/${templateId}/schema`;
  };

  const redirectToSwagger = () => {
    window.open('https://empire-compass-backend.tib.eu/api-docs/', '_blank');
  };

  const redirectToNews = () => {
    const currentTemplateId = templateId || selectedTemplate;
    navigate(`/${currentTemplateId}/news`);
  };

  const redirectToScidQuest = () => {
    const currentTemplateId = templateId || selectedTemplate;
    navigate(`/${currentTemplateId}/scid-quest`);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
      }}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 64, sm: 72 },
          px: { xs: 2, sm: 3 },
          py: { xs: 1.5, sm: 1 },
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: { xs: 'flex-start', md: 'space-between' },
          gap: { xs: 1.75, md: 0 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            width: { xs: '100%', md: 'auto' },
            gap: { xs: 1, md: 1.5 },
            flex: { md: '1 1 auto' },
          }}
        >
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={handleDrawerOpen}
            edge="start"
            size="small"
            sx={{
              color: 'text.primary',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            <MenuIcon sx={{ fontSize: '1.5rem' }} />
          </IconButton>

          <Typography
            variant="h6"
            component={RouterLink}
            to={`/${selectedTemplate}/`}
            sx={{
              flexGrow: { xs: 1, sm: 0 },
              textDecoration: 'none',
              color: '#e86161',
              fontWeight: 600,
              fontSize: { xs: '1.2rem', sm: '1.25rem' },
              display: 'flex',
              alignItems: 'center',
              justifyContent: { xs: 'center', sm: 'flex-start' },
              letterSpacing: '-0.02em',
              textAlign: { xs: 'center', sm: 'left' },
              '&:hover': {
                opacity: 0.85,
              },
              transition: 'opacity 0.2s ease-in-out',
            }}
          >
            ORKG Atlas
          </Typography>

          {!isMobile && (
            <Breadcrumbs
              separator={
                <NavigateNextIcon
                  fontSize="small"
                  sx={{ color: 'text.secondary' }}
                />
              }
              aria-label="breadcrumb"
              sx={{
                '& .MuiBreadcrumbs-li': {
                  display: 'flex',
                  alignItems: 'center',
                },
                maxWidth: { sm: 300, md: 400 },
                overflow: 'hidden',
                ml: 2,
              }}
            >
              {getBreadcrumbs().map((breadcrumb, index) => {
                const isLast = index === getBreadcrumbs().length - 1;
                return isLast ? (
                  <Typography
                    key={breadcrumb.path}
                    color="text.primary"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {breadcrumb.label}
                  </Typography>
                ) : (
                  <Link
                    key={breadcrumb.path}
                    component={RouterLink}
                    to={breadcrumb.path}
                    color="text.secondary"
                    sx={{
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      '&:hover': {
                        color: '#e86161',
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    {breadcrumb.label}
                  </Link>
                );
              })}
            </Breadcrumbs>
          )}
        </Box>

        <Box
          sx={{
            width: { xs: '100%', md: 'auto' },
            display: { xs: 'grid', md: 'flex' },
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fit, minmax(200px, 1fr))',
              md: 'unset',
            },
            justifyItems: { xs: 'center', md: 'unset' },
            alignItems: 'center',
            gap: { xs: 1.25, md: 2 },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: { xs: 'center', md: 'flex-end' },
              width: { xs: '100%', md: 'auto' },
            }}
          >
            <LoginORKG />
          </Box>

          {currentBackupName && (
            <Tooltip
              title={`Change data source — currently ${currentBackupName}`}
            >
              <Box
                role="button"
                tabIndex={0}
                aria-label="Change data source"
                onClick={() => setBackupSelectorOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setBackupSelectorOpen(true);
                  }
                }}
                sx={(theme) => {
                  const snapshot = getSnapshotColors(theme.palette.mode);
                  return {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.25,
                    height: 34,
                    boxSizing: 'border-box',
                    borderRadius: 1,
                    backgroundColor: snapshot.wash,
                    color: snapshot.ink,
                    border: `1px solid ${snapshot.main}`,
                    boxShadow: `inset 3px 0 0 ${snapshot.main}`,
                    cursor: 'pointer',
                    transition:
                      'border-color 0.2s ease, background-color 0.2s ease',
                    '&:hover': {
                      filter: 'brightness(0.97)',
                    },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: theme.palette.primary.main,
                      outlineOffset: 2,
                    },
                  };
                }}
              >
                <Box
                  sx={(theme) => ({
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: getSnapshotColors(theme.palette.mode).main,
                    '@media (prefers-reduced-motion: no-preference)': {
                      animation: 'snapshotPip 2.4s ease-out infinite',
                    },
                    '@keyframes snapshotPip': {
                      '0%': { opacity: 1 },
                      '70%': { opacity: 0.45 },
                      '100%': { opacity: 1 },
                    },
                  })}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontSize: '0.68rem',
                    lineHeight: 1,
                  }}
                >
                  Snapshot
                </Typography>
                <KeyboardArrowDownIcon sx={{ fontSize: 16, opacity: 0.7 }} />
              </Box>
            </Tooltip>
          )}

          <Button
            id="header-template-picker-button"
            variant="outlined"
            size="small"
            onClick={() => setTemplatePickerOpen(true)}
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
            sx={{
              minWidth: { xs: '100%', md: 220 },
              maxWidth: { xs: '100%', md: 280 },
              borderRadius: 1.5,
              py: 0.75,
              px: 1.25,
              justifyContent: 'space-between',
              textAlign: 'left',
              borderColor: 'divider',
              backgroundColor: { xs: 'background.default', sm: 'inherit' },
              '&:hover': {
                borderColor: 'text.secondary',
                backgroundColor: {
                  xs: 'action.hover',
                  sm: 'rgba(232,97,97,0.06)',
                },
              },
            }}
          >
            <Box sx={{ overflow: 'hidden', textAlign: 'left' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                Theme
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                noWrap
                sx={{
                  color: 'text.primary',
                  fontSize: '0.8125rem',
                }}
              >
                {templatesForSelect.find((t) => t.id === selectedTemplate)
                  ?.title ??
                  templateConfig[selectedTemplate]?.title ??
                  selectedTemplate}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.65rem',
                  color: 'text.secondary',
                  display: 'block',
                }}
                noWrap
              >
                {selectedTemplate}
              </Typography>
            </Box>
          </Button>

          <TemplatePickerDialog
            open={templatePickerOpen}
            onClose={() => setTemplatePickerOpen(false)}
            items={templatesForSelect.filter(
              (t): t is Template => !!t && !!t.id
            )}
            selectedId={selectedTemplate}
            onConfirm={applyTemplateSelection}
            catalogSource={catalogSource}
            orkgApiTotalElements={orkgApiTotalElements}
          />
        </Box>

        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            justifyContent: 'flex-end',
            width: 'auto',
            gap: 0.5,
          }}
        >
          {highPriorityNewsCount > 0 && (
            <Tooltip title={`${highPriorityNewsCount} High Priority News`}>
              <IconButton
                onClick={redirectToNews}
                size="small"
                sx={{
                  color:
                    highPriorityNewsCount > 0 ? '#e86161' : 'text.secondary',
                  '&:hover': {
                    color: '#e86161',
                    backgroundColor: 'rgba(232, 97, 97, 0.08)',
                  },
                }}
              >
                <Badge
                  badgeContent={highPriorityNewsCount}
                  color="error"
                  sx={{
                    '& .MuiBadge-badge': {
                      fontSize: '0.65rem',
                      height: '18px',
                      minWidth: '18px',
                      padding: '0 4px',
                    },
                  }}
                >
                  <NotificationsIcon sx={{ fontSize: '1.1rem' }} />
                </Badge>
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Components">
            <IconButton
              onClick={redirectToStorybook}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <BookIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Scid-Quest">
            <IconButton
              onClick={redirectToScidQuest}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <AssignmentIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="API Docs">
            <IconButton
              onClick={redirectToSwagger}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <ApiIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Schema">
            <IconButton
              onClick={redirectToArchitecture}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <AccountTreeIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="GitHub">
            <IconButton
              onClick={redirectToGitHub}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <GitHubIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Data Source">
            <IconButton
              onClick={() => setBackupSelectorOpen(true)}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <SettingsIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
      <BackupSelector
        open={backupSelectorOpen}
        onClose={() => setBackupSelectorOpen(false)}
        templateId={selectedTemplate}
      />
    </AppBar>
  );
};

export default Header;
