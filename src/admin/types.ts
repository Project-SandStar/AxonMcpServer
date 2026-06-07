/**
 * Admin API types
 */

export interface ServerStatus {
  status: 'running' | 'starting' | 'error';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  initialized: boolean;
  version: string;
  serverPath: string;
  port: number;
  activeInstance?: string;
  activeProject?: string;
  stats: {
    instances: number;
    projects: number;
    functions: number;
    docsIndexed: number;
    docsLibraries: number;
    docsSections: number;
  };
}

export interface InstanceInfo {
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  projectCount: number;
  isActive: boolean;
  projects: ProjectInfo[];
}

export interface ProjectInfo {
  project: string;
  instance: string;
  description?: string;
  functionCount?: number;
  lastSync?: string;
  isActive: boolean;
  isSyncing?: boolean;
}

export interface CacheInfo {
  name: string;
  path: string;
  size: number;
  lastModified: string;
  age: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export interface AdminCredentials {
  username: string;
  password: string;
}
