/**
 * Backup Manager for Axon MCP Server
 * Handles export/import of all settings, OAuth data, and cached data
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { PrismaClient } from '../generated/prisma/client.js';

export interface BackupMetadata {
  version: string;
  createdAt: string;
  serverVersion: string;
  description?: string;
  contents: {
    users: number;
    oauthClients: number;
    oauthSessions: number;
    configFiles: number;
    cacheFiles: number;
  };
}

export interface BackupInfo {
  filename: string;
  filepath: string;
  size: number;
  createdAt: string;
  metadata?: BackupMetadata;
}

export interface BackupData {
  metadata: BackupMetadata;
  users: any[];
  oauthClients: any[];
  oauthSessions: any[];
  accessTokens: any[];
  refreshTokens: any[];
  authorizationCodes: any[];
  configFiles: { [filename: string]: any };
  settings: any;
}

export class BackupManager {
  private backupDir: string;
  private configDir: string;
  private cacheDir: string;

  constructor(
    private prisma: PrismaClient,
    configDir: string = './config',
    cacheDir: string = './.cache'
  ) {
    this.configDir = path.resolve(configDir);
    this.cacheDir = path.resolve(cacheDir);
    this.backupDir = path.join(this.configDir, 'backups');

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create a full backup of all data
   */
  async createBackup(description?: string): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const filepath = path.join(this.backupDir, filename);

    // Collect all data
    const backupData = await this.collectBackupData(description);

    // Create zip file
    await this.createZipBackup(filepath, backupData);

    // Get file info
    const stats = fs.statSync(filepath);

    return {
      filename,
      filepath,
      size: stats.size,
      createdAt: backupData.metadata.createdAt,
      metadata: backupData.metadata,
    };
  }

  /**
   * Collect all data for backup
   */
  private async collectBackupData(description?: string): Promise<BackupData> {
    // Get users from users.json
    const usersFile = path.join(this.configDir, 'users.json');
    let users: any[] = [];
    if (fs.existsSync(usersFile)) {
      const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
      users = usersData.users || [];
    }

    // Get OAuth data from database
    const oauthClients = await this.prisma.oAuthClient.findMany();
    const oauthSessions = await this.prisma.oAuthSession.findMany();
    const accessTokens = await this.prisma.accessToken.findMany();
    const refreshTokens = await this.prisma.refreshToken.findMany();
    const authorizationCodes = await this.prisma.authorizationCode.findMany();

    // Get config files (excluding backups and users.json)
    const configFiles: { [filename: string]: any } = {};
    const excludeFiles = ['users.json', 'backups'];
    const configFileList = fs.readdirSync(this.configDir);

    for (const file of configFileList) {
      if (file.endsWith('.json') && !excludeFiles.includes(file)) {
        const filePath = path.join(this.configDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          try {
            configFiles[file] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          } catch {
            // Skip non-JSON files
          }
        }
      }
    }

    // Get settings
    const settingsFile = path.join(this.configDir, 'axonMcpServer-config.json');
    let settings = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }

    const metadata: BackupMetadata = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      serverVersion: '1.0.0',
      description,
      contents: {
        users: users.length,
        oauthClients: oauthClients.length,
        oauthSessions: oauthSessions.length,
        configFiles: Object.keys(configFiles).length,
        cacheFiles: 0, // Cache files are handled separately in zip
      },
    };

    return {
      metadata,
      users,
      oauthClients,
      oauthSessions,
      accessTokens,
      refreshTokens,
      authorizationCodes,
      configFiles,
      settings,
    };
  }

  /**
   * Create zip backup file
   */
  private async createZipBackup(filepath: string, data: BackupData): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filepath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // Add metadata
      archive.append(JSON.stringify(data.metadata, null, 2), { name: 'metadata.json' });

      // Add users
      archive.append(JSON.stringify({ users: data.users }, null, 2), { name: 'users.json' });

      // Add OAuth data
      archive.append(JSON.stringify({
        clients: data.oauthClients,
        sessions: data.oauthSessions,
        accessTokens: data.accessTokens,
        refreshTokens: data.refreshTokens,
        authorizationCodes: data.authorizationCodes,
      }, null, 2), { name: 'oauth.json' });

      // Add config files
      archive.append(JSON.stringify(data.configFiles, null, 2), { name: 'config-files.json' });

      // Add settings
      archive.append(JSON.stringify(data.settings, null, 2), { name: 'settings.json' });

      // Add cache files if they exist (JSON caches, SQLite DBs, LanceDB directories)
      if (fs.existsSync(this.cacheDir)) {
        const cacheFiles = fs.readdirSync(this.cacheDir);
        for (const file of cacheFiles) {
          const filePath = path.join(this.cacheDir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile() && (file.endsWith('.json') || file.endsWith('.db'))) {
            archive.file(filePath, { name: `cache/${file}` });
          } else if (stat.isDirectory() && file.endsWith('.db')) {
            // LanceDB directories (e.g., axonvector.db/)
            archive.directory(filePath, `cache/${file}`);
          }
        }
      }

      archive.finalize();
    });
  }

  /**
   * Restore from a backup file
   */
  async restoreBackup(filename: string): Promise<{ success: boolean; message: string }> {
    const filepath = path.join(this.backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return { success: false, message: 'Backup file not found' };
    }

    try {
      // Extract backup data
      const backupData = await this.extractBackup(filepath);

      // Clear existing OAuth data
      await this.prisma.oAuthSession.deleteMany();
      await this.prisma.accessToken.deleteMany();
      await this.prisma.refreshToken.deleteMany();
      await this.prisma.authorizationCode.deleteMany();
      await this.prisma.oAuthClient.deleteMany();

      // Restore OAuth clients
      for (const client of backupData.oauthClients) {
        await this.prisma.oAuthClient.create({
          data: {
            id: client.id,
            clientId: client.clientId,
            clientSecret: client.clientSecret,
            clientName: client.clientName,
            redirectUris: client.redirectUris,
            scope: client.scope,
            createdAt: new Date(client.createdAt),
          },
        });
      }

      // Restore users
      if (backupData.users && backupData.users.length > 0) {
        const usersFile = path.join(this.configDir, 'users.json');
        fs.writeFileSync(usersFile, JSON.stringify({ users: backupData.users }, null, 2));
      }

      // Restore config files
      for (const [filename, content] of Object.entries(backupData.configFiles)) {
        const filePath = path.join(this.configDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
      }

      // Restore settings
      if (backupData.settings) {
        const settingsFile = path.join(this.configDir, 'axonMcpServer-config.json');
        fs.writeFileSync(settingsFile, JSON.stringify(backupData.settings, null, 2));
      }

      // Restore cache files (JSON)
      if (backupData.cacheFiles) {
        for (const [filename, content] of Object.entries(backupData.cacheFiles)) {
          const filePath = path.join(this.cacheDir, filename);
          fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        }
      }

      // Restore binary cache files (SQLite .db)
      if (backupData.cacheBinaryFiles && backupData._extractDir) {
        const extractCacheDir = path.join(backupData._extractDir, 'cache');
        for (const file of backupData.cacheBinaryFiles) {
          const srcPath = path.join(extractCacheDir, file);
          const destPath = path.join(this.cacheDir, file);
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }

      // Restore LanceDB directories
      if (backupData.cacheDirs && backupData._extractDir) {
        const extractCacheDir = path.join(backupData._extractDir, 'cache');
        for (const dir of backupData.cacheDirs) {
          const srcPath = path.join(extractCacheDir, dir);
          const destPath = path.join(this.cacheDir, dir);
          if (fs.existsSync(srcPath)) {
            // Remove existing directory before restoring
            if (fs.existsSync(destPath)) {
              fs.rmSync(destPath, { recursive: true, force: true });
            }
            this.copyDirectorySync(srcPath, destPath);
          }
        }
      }

      // Cleanup temp extract directory
      if (backupData._extractDir && fs.existsSync(backupData._extractDir)) {
        fs.rmSync(backupData._extractDir, { recursive: true, force: true });
      }

      return { success: true, message: 'Backup restored successfully. Please restart the server.' };
    } catch (error) {
      return { success: false, message: `Failed to restore backup: ${error}` };
    }
  }

  /**
   * Extract backup data from zip file
   */
  private async extractBackup(filepath: string): Promise<BackupData & { cacheFiles?: { [key: string]: any }; cacheBinaryFiles?: string[]; cacheDirs?: string[]; _extractDir?: string }> {
    const extractDir = path.join(this.backupDir, 'temp-extract-' + Date.now());
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      // Extract zip
      await fs.createReadStream(filepath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .promise();

      // Read extracted files
      const metadata = JSON.parse(fs.readFileSync(path.join(extractDir, 'metadata.json'), 'utf-8'));
      const usersData = JSON.parse(fs.readFileSync(path.join(extractDir, 'users.json'), 'utf-8'));
      const oauthData = JSON.parse(fs.readFileSync(path.join(extractDir, 'oauth.json'), 'utf-8'));
      const configFiles = JSON.parse(fs.readFileSync(path.join(extractDir, 'config-files.json'), 'utf-8'));
      const settings = JSON.parse(fs.readFileSync(path.join(extractDir, 'settings.json'), 'utf-8'));

      // Read cache files if they exist
      const cacheFiles: { [key: string]: any } = {};
      const cacheBinaryFiles: string[] = [];
      const cacheDirs: string[] = [];
      const cacheDir = path.join(extractDir, 'cache');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          const entryPath = path.join(cacheDir, file);
          const entryStat = fs.statSync(entryPath);
          if (entryStat.isFile() && file.endsWith('.json')) {
            cacheFiles[file] = JSON.parse(fs.readFileSync(entryPath, 'utf-8'));
          } else if (entryStat.isFile() && file.endsWith('.db')) {
            cacheBinaryFiles.push(file);
          } else if (entryStat.isDirectory() && file.endsWith('.db')) {
            cacheDirs.push(file);
          }
        }
      }

      return {
        metadata,
        users: usersData.users || [],
        oauthClients: oauthData.clients || [],
        oauthSessions: oauthData.sessions || [],
        accessTokens: oauthData.accessTokens || [],
        refreshTokens: oauthData.refreshTokens || [],
        authorizationCodes: oauthData.authorizationCodes || [],
        configFiles,
        settings,
        cacheFiles,
        cacheBinaryFiles,
        cacheDirs,
        _extractDir: extractDir,
      };
    } catch (error) {
      // Cleanup temp directory on error
      fs.rmSync(extractDir, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * List all available backups
   */
  listBackups(): BackupInfo[] {
    if (!fs.existsSync(this.backupDir)) {
      return [];
    }

    const files = fs.readdirSync(this.backupDir);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (file.endsWith('.zip')) {
        const filepath = path.join(this.backupDir, file);
        const stats = fs.statSync(filepath);

        // Try to read metadata from zip
        let metadata: BackupMetadata | undefined;
        try {
          // We'll read metadata on demand, not here for performance
        } catch {
          // Ignore metadata read errors
        }

        backups.push({
          filename: file,
          filepath,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          metadata,
        });
      }
    }

    // Sort by creation date (newest first)
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return backups;
  }

  /**
   * Delete a backup file
   */
  deleteBackup(filename: string): boolean {
    const filepath = path.join(this.backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return false;
    }

    fs.unlinkSync(filepath);
    return true;
  }

  /**
   * Get backup file path for download
   */
  getBackupPath(filename: string): string | null {
    const filepath = path.join(this.backupDir, filename);

    if (!fs.existsSync(filepath)) {
      return null;
    }

    return filepath;
  }

  /**
   * Recursively copy a directory
   */
  private copyDirectorySync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
