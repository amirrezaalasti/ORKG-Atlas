import { Box, Button, Typography, useTheme } from '@mui/material';
import { useState, useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import BackupService from '../services/BackupService';
import { useBackupChange } from '../hooks/useBackupChange';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import { getSnapshotColors } from '../constants/brandColors';
import { easeOutExpo, MotionBox } from '../constants/motion';

const BackupWarningBanner = () => {
  const theme = useTheme();
  const [isUsingBackup, setIsUsingBackup] = useState(false);
  const [backupName, setBackupName] = useState<string>('');
  const backupVersion = useBackupChange();
  const snapshot = getSnapshotColors(theme.palette.mode);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const checkBackup = () => {
      const usingBackup = BackupService.isExplicitlyUsingBackup();
      setIsUsingBackup(usingBackup);
      if (usingBackup) {
        setBackupName(BackupService.getCurrentBackupName() || 'uploaded file');
      } else {
        setBackupName('');
      }
    };

    checkBackup();
    const interval = setInterval(checkBackup, 2000);
    return () => clearInterval(interval);
  }, [backupVersion]);

  if (!isUsingBackup) {
    return null;
  }

  const handleSwitchToLive = () => {
    BackupService.clearBackupSelection();
    window.location.reload();
  };

  return (
    <MotionBox
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: easeOutExpo }}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        width: '100%',
        display: 'flex',
        alignItems: { xs: 'stretch', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1.25, sm: 2 },
        px: { xs: 1.5, sm: 2.5 },
        py: 1.25,
        backgroundColor: snapshot.wash,
        color: snapshot.ink,
        borderBottom: `1px solid ${snapshot.main}`,
        boxShadow: `inset 4px 0 0 ${snapshot.main}`,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="p"
          sx={{
            m: 0,
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: snapshot.main,
          }}
        >
          Saved snapshot
        </Typography>
        <Typography
          component="p"
          sx={{
            m: 0,
            mt: 0.25,
            fontSize: '0.875rem',
            lineHeight: 1.35,
            color: snapshot.ink,
          }}
        >
          Charts and questions come from{' '}
          <Box
            component="span"
            sx={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.8em',
              wordBreak: 'break-all',
            }}
          >
            {backupName}
          </Box>
          , not live data.
        </Typography>
      </Box>
      <Button
        variant="contained"
        size="small"
        startIcon={<CloudDoneOutlinedIcon />}
        onClick={handleSwitchToLive}
        sx={{
          flexShrink: 0,
          alignSelf: { xs: 'flex-start', sm: 'center' },
          backgroundColor: snapshot.ink,
          color: snapshot.wash,
          boxShadow: 'none',
          '&:hover': {
            backgroundColor: snapshot.main,
            boxShadow: 'none',
            transform: 'none',
          },
        }}
      >
        Use live data
      </Button>
    </MotionBox>
  );
};

export default BackupWarningBanner;
