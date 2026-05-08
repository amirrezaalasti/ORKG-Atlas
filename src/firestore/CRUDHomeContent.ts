import {
  getHomeContent as getHomeContentApi,
  updateHomeContent as updateHomeContentApi,
} from '../services/backendApi';
import BackupService from '../services/BackupService';

export type {
  HeroCta,
  HeaderContent,
  TemplateCoverageCard,
  TemplateCoverageContent,
  FooterCtaContent,
  AboutProjectContent,
  Feature,
  KeyFeaturesContent,
  Phase,
  FutureDevelopmentContent,
  ContactContent,
  Partner,
  PartnersContent,
  TemplateInfoBox,
  TemplateInfoBoxes,
  Template,
  HomeContentData,
} from './homeContentModel';

export { defaultHomeContent, mergeWithHomeDefaults } from './homeContentModel';

import type { HomeContentData } from './homeContentModel';
import { defaultHomeContent, mergeWithHomeDefaults } from './homeContentModel';

/**
 * Get home content from backend API
 */
export const getHomeContent = async (): Promise<HomeContentData> => {
  try {
    if (BackupService.isExplicitlyUsingBackup()) {
      console.log('CRUDHomeContent: Using explicit backup for home content');
      const content = await BackupService.getHomeContent();
      console.log('CRUDHomeContent: Got content from backup:', content);
      return mergeWithHomeDefaults(content as Partial<HomeContentData>);
    }

    const content = await getHomeContentApi();
    if (content && typeof content === 'object') {
      return mergeWithHomeDefaults(content as Partial<HomeContentData>);
    } else {
      return defaultHomeContent;
    }
  } catch (error) {
    console.warn('Backend API failed, falling back to local backup:', error);
    try {
      const content = await BackupService.getHomeContent();
      return mergeWithHomeDefaults(content as Partial<HomeContentData>);
    } catch (backupError) {
      console.error('Error fetching home content from backup:', backupError);
      return defaultHomeContent;
    }
  }
};

/**
 * Set/update home content via backend API
 */
export const setHomeContent = async (
  content: HomeContentData,
  userId?: string,
  userEmail?: string,
  keycloakToken?: string
): Promise<void> => {
  try {
    if (!userId || !userEmail) {
      throw new Error(
        'UserId and userEmail are required for updating home content'
      );
    }

    await updateHomeContentApi(content, userId, userEmail, keycloakToken);
  } catch (error) {
    console.error('Error updating home content:', error);
    throw error;
  }
};

/**
 * Initialize home content with default values (for first-time setup)
 */
export const initializeHomeContent = async (
  userId?: string,
  userEmail?: string,
  keycloakToken?: string
): Promise<void> => {
  try {
    if (!userId || !userEmail) {
      throw new Error(
        'UserId and userEmail are required for initializing home content'
      );
    }

    try {
      const existingContent = await getHomeContentApi();
      if (existingContent && typeof existingContent === 'object') {
        return;
      }
    } catch (fetchError: unknown) {
      const error = fetchError as Error;
      if (
        error?.message?.includes('404') ||
        error?.message?.includes('not found')
      ) {
      } else {
        throw fetchError;
      }
    }

    await setHomeContent(defaultHomeContent, userId, userEmail, keycloakToken);
  } catch (error) {
    console.error('Error initializing home content:', error);
    throw error;
  }
};

/**
 * Get all documents in HomeContent collection (for backup purposes)
 */
export const getAllHomeContent = async (): Promise<
  Array<{ id: string } & HomeContentData>
> => {
  try {
    const content = await getHomeContentApi();
    if (content && typeof content === 'object') {
      return [{ id: 'sections', ...content }];
    }
    return [];
  } catch (error) {
    console.error('Error fetching all home content:', error);
    throw error;
  }
};

const CRUDHomeContent = {
  getHomeContent,
  setHomeContent,
  initializeHomeContent,
  getAllHomeContent,
  defaultHomeContent,
};

export default CRUDHomeContent;
