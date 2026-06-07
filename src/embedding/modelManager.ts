/**
 * Model Manager - Persistent model storage and download management
 *
 * Stores HuggingFace models in .cache/models/ so they survive npm install.
 */

import * as path from 'path';
import * as fs from 'fs';

// ============================================
// Constants
// ============================================

export const MODELS_DIR = path.join(process.cwd(), '.cache', 'models');

export interface KnownModel {
  id: string;
  name: string;
  dimensions: number;
  size: string;
  category: 'code' | 'docs';
}

export const KNOWN_MODELS: KnownModel[] = [
  { id: 'Xenova/all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2', dimensions: 384, size: '~23 MB', category: 'code' },
  { id: 'Xenova/bge-small-en-v1.5', name: 'bge-small-en-v1.5', dimensions: 384, size: '~33 MB', category: 'code' },
  { id: 'Xenova/jina-embeddings-v2-base-en', name: 'jina-embeddings-v2-base-en', dimensions: 768, size: '~137 MB', category: 'docs' },
];

// ============================================
// Types
// ============================================

export interface ModelStatus {
  modelId: string;
  name: string;
  category: 'code' | 'docs';
  dimensions: number;
  estimatedSize: string;
  downloaded: boolean;
  sizeOnDisk: number;
}

// ============================================
// Status Functions
// ============================================

function getModelLocalPath(modelId: string): string {
  return path.join(MODELS_DIR, modelId);
}

function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

function isModelDownloaded(modelId: string): boolean {
  const modelPath = getModelLocalPath(modelId);
  if (!fs.existsSync(modelPath)) return false;
  return hasOnnxFiles(modelPath);
}

function hasOnnxFiles(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (hasOnnxFiles(path.join(dirPath, entry.name))) return true;
    } else if (entry.name.endsWith('.onnx')) {
      return true;
    }
  }
  return false;
}

export function getModelStatus(modelId: string): ModelStatus {
  const known = KNOWN_MODELS.find(m => m.id === modelId);
  const downloaded = isModelDownloaded(modelId);
  const sizeOnDisk = downloaded ? getDirSize(getModelLocalPath(modelId)) : 0;

  return {
    modelId,
    name: known?.name || modelId.split('/').pop() || modelId,
    category: known?.category || 'code',
    dimensions: known?.dimensions || 0,
    estimatedSize: known?.size || 'unknown',
    downloaded,
    sizeOnDisk,
  };
}

export function getAllModelStatuses(): ModelStatus[] {
  return KNOWN_MODELS.map(m => getModelStatus(m.id));
}

// ============================================
// Download
// ============================================

const activeDownloads = new Map<string, Promise<void>>();

export type ProgressCallback = (data: {
  status: 'downloading' | 'done' | 'error';
  progress?: number;
  file?: string;
  modelId: string;
  error?: string;
}) => void;

export async function downloadModel(modelId: string, onProgress?: ProgressCallback): Promise<void> {
  const existing = activeDownloads.get(modelId);
  if (existing) {
    await existing;
    return;
  }

  const downloadPromise = doDownload(modelId, onProgress);
  activeDownloads.set(modelId, downloadPromise);

  try {
    await downloadPromise;
  } finally {
    activeDownloads.delete(modelId);
  }
}

async function doDownload(modelId: string, onProgress?: ProgressCallback): Promise<void> {
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODELS_DIR;

    onProgress?.({ status: 'downloading', progress: 0, file: 'initializing...', modelId });

    await pipeline('feature-extraction', modelId, {
      dtype: 'q8' as any,
      cache_dir: MODELS_DIR,
      progress_callback: (progressData: any) => {
        if (progressData && onProgress) {
          const file = progressData.file || progressData.name || '';
          const progress = typeof progressData.progress === 'number' ? Math.round(progressData.progress) : undefined;
          onProgress({ status: 'downloading', progress, file, modelId });
        }
      },
    } as any);

    onProgress?.({ status: 'done', progress: 100, modelId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    onProgress?.({ status: 'error', modelId, error: errMsg });
    throw error;
  }
}
