import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.skyspark for SkySpark-specific configuration
dotenv.config({ path: '.env.skyspark' });

export interface SkySparkInstance {
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  username?: string;  // Instance-level username (optional)
  password?: string;  // Instance-level password (optional)
  defaultProjName?: string;  // Project to use for discovery (optional, defaults to first project or 'demo')
  projects: SkySparkProject[];
}

export interface SkySparkProject {
  name: string;
  username?: string;  // Project-specific username (optional, overrides instance)
  password?: string;  // Project-specific password (optional, overrides instance)
  description?: string;
}

export interface ActiveConfig {
  instance: SkySparkInstance;
  project: SkySparkProject;
  format: 'zinc' | 'json' | 'hayson';
}

export class SkySparkConfigManager {
  private instances: Map<string, SkySparkInstance> = new Map();
  private instanceFilenames: Map<string, string> = new Map(); // Track original filenames
  private filenameToInstance: Map<string, string> = new Map(); // Track filename -> instance name mapping
  private activeConfig?: ActiveConfig;
  private watcher?: fs.FSWatcher;
  private watchDebounce?: NodeJS.Timeout;
  private reloadListeners: Array<() => void> = [];

  constructor(private configDir: string = './config') {
    this.loadConfigurations();
  }

  /**
   * Subscribe to reload events. Called whenever the watcher (or an explicit
   * reload()) refreshes the in-memory instance map. Returns an unsubscribe fn.
   */
  onReload(fn: () => void): () => void {
    this.reloadListeners.push(fn);
    return () => {
      this.reloadListeners = this.reloadListeners.filter(l => l !== fn);
    };
  }

  /**
   * Start watching the config directory for changes. Debounces rapid bursts
   * (editors often emit several events per save) and only reloads when an
   * actual SkySpark connection JSON is touched.
   */
  startWatching(): void {
    if (this.watcher) return;
    const configPath = path.resolve(this.configDir);
    if (!fs.existsSync(configPath)) return;

    try {
      this.watcher = fs.watch(configPath, { persistent: false }, (_eventType, filename) => {
        if (!filename) return;
        // Only react to JSON config files (skip backups, archives, debug files).
        if (!filename.endsWith('.json')) return;
        if (['axonMcpServer-config.json', 'admin.json', 'users.json'].includes(filename)) return;

        if (this.watchDebounce) clearTimeout(this.watchDebounce);
        this.watchDebounce = setTimeout(() => {
          console.error(`👀 Config change detected (${filename}) — reloading…`);
          try {
            this.reload();
          } catch (err: any) {
            console.error(`⚠️  Auto-reload failed: ${err?.message || err}`);
          }
        }, 200);
      });
      this.watcher.on('error', (err) => {
        console.error(`⚠️  Config watcher error: ${err.message}`);
      });
      console.error(`👀 Watching ${configPath} for connection changes`);
    } catch (err: any) {
      console.error(`⚠️  Failed to start config watcher: ${err?.message || err}`);
    }
  }

  stopWatching(): void {
    if (this.watchDebounce) clearTimeout(this.watchDebounce);
    this.watcher?.close();
    this.watcher = undefined;
  }

  /**
   * Re-read all instance configuration files from disk. Called when a connection
   * is added/edited/deleted via the admin UI so the in-memory instance list stays
   * in sync without requiring a server restart.
   *
   * Preserves the activeConfig if the active instance/project still exists after
   * reload; otherwise falls back to the first available project.
   */
  reload(): void {
    const previousActive = this.activeConfig
      ? { instance: this.activeConfig.instance.name, project: this.activeConfig.project.name }
      : null;

    this.instances.clear();
    this.instanceFilenames.clear();
    this.filenameToInstance.clear();
    this.activeConfig = undefined;

    this.loadConfigurations();

    // Best effort: restore the previously active instance/project if it survives.
    if (previousActive) {
      const inst = this.instances.get(previousActive.instance);
      const proj = inst?.projects?.find(p => p.name === previousActive.project);
      if (inst && proj) {
        this.activeConfig = { instance: inst, project: proj, format: 'zinc' };
      }
    }

    console.error(`🔄 Config reloaded: ${this.instances.size} instance(s)`);

    // Notify subscribers (admin context, MCP layer, etc.) so they can refresh
    // any derived state (caches, indexes) without polling.
    for (const listener of this.reloadListeners) {
      try { listener(); } catch (err: any) {
        console.error(`⚠️  Reload listener threw: ${err?.message || err}`);
      }
    }
  }
  
  /**
   * Load all configuration files
   */
  private loadConfigurations() {
    // Load instance configurations from config files only
    this.loadInstanceConfigs();

    // Use first instance as default if files exist
    if (this.instances.size > 0) {
      const firstInstance = Array.from(this.instances.values())[0];
      const projects = firstInstance?.projects || [];
      if (firstInstance && projects.length > 0) {
        // Use defaultProjName if specified, otherwise first project
        let targetProject: SkySparkProject;
        if (firstInstance.defaultProjName) {
          const foundProject = projects.find(p => p.name === firstInstance.defaultProjName);
          if (foundProject) {
            targetProject = foundProject;
            console.error(`   🎯 Using default project: ${firstInstance.defaultProjName}`);
          } else {
            console.error(`   ⚠️  Default project not found: ${firstInstance.defaultProjName}, using first project`);
            targetProject = projects[0];
          }
        } else {
          targetProject = projects[0];
        }

        this.activeConfig = {
          instance: firstInstance,
          project: targetProject,
          format: 'zinc'
        };
      }
    } else {
      console.error('⚠️  No SkySpark configuration files found. Please create config files in the config directory.');
    }
  }
  
  /**
   * Load instance configuration files from config directory
   */
  private loadInstanceConfigs() {
    const configPath = path.resolve(this.configDir);
    if (!fs.existsSync(configPath)) {
      console.error(`⚠️  Config directory not found: ${configPath}`);
      return;
    }

    const files = fs.readdirSync(configPath);
    console.error(`📂 Found ${files.length} files in config directory`);
    // Files that are not SkySpark connection configs
    const excludedFiles = ['axonMcpServer-config.json', 'admin.json', 'users.json'];

    for (const file of files) {
      if (file.endsWith('.json') && !file.endsWith('.backup') && !file.endsWith('.archived') && !file.endsWith('.old') && !excludedFiles.includes(file)) {
        try {
          const content = fs.readFileSync(path.join(configPath, file), 'utf-8');
          const config = JSON.parse(content) as SkySparkInstance;

          // Validate it looks like an instance config (must have name and host)
          if (!config.name || !config.host) {
            console.error(`   ⏭️  Skipped: ${file} (not a SkySpark instance config)`);
            continue;
          }

          // Ensure projects array exists
          if (!config.projects) {
            config.projects = [];
          }

          this.instances.set(config.name, config);
          // Track the original filename for this instance
          this.instanceFilenames.set(config.name, file);
          // Track filename -> instance name mapping (without .json extension)
          const filenameWithoutExt = file.replace(/\.json$/, '');
          this.filenameToInstance.set(filenameWithoutExt, config.name);
          console.error(`   ✅ Loaded: ${file} → instance "${config.name}" (${config.projects.length} projects)`);
        } catch (error) {
          console.error(`   ❌ Failed to load config ${file}:`, error);
        }
      }
    }
  }
  
  /**
   * Get all configured instances
   */
  getInstances(): SkySparkInstance[] {
    return Array.from(this.instances.values());
  }
  
  /**
   * Get a specific instance by name
   */
  getInstance(name: string): SkySparkInstance | undefined {
    return this.instances.get(name);
  }

  /**
   * Find instance by flexible name lookup (JSON name field or filename)
   */
  findInstanceByName(name: string): SkySparkInstance | undefined {
    // First try exact match on JSON name field
    let instance = this.instances.get(name);
    if (instance) {
      return instance;
    }

    // Fall back to filename matching (case-insensitive)
    const filenameMatch = this.filenameToInstance.get(name.toLowerCase());
    if (filenameMatch) {
      return this.instances.get(filenameMatch);
    }

    // Try case-insensitive filename matching
    for (const [filename, instanceName] of this.filenameToInstance) {
      if (filename.toLowerCase() === name.toLowerCase()) {
        return this.instances.get(instanceName);
      }
    }

    return undefined;
  }
  
  /**
   * Get active configuration
   */
  getActiveConfig(): ActiveConfig {
    if (!this.activeConfig) {
      throw new Error('No active SkySpark configuration');
    }
    return this.activeConfig;
  }
  
  /**
   * Get credentials for a project (with fallback to instance-level)
   */
  getProjectCredentials(instanceName: string, projectName: string): { username: string; password: string } {
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceName}`);
    }

    const project = (instance.projects || []).find(p => p.name === projectName);
    if (!project) {
      throw new Error(`Project not found: ${projectName} in instance ${instanceName}`);
    }
    
    // Use project-specific credentials if available, otherwise use instance-level
    const username = project.username || instance.username || 'su';
    const password = project.password || instance.password || 'su';
    
    return { username, password };
  }
  
  /**
   * Switch to a different instance and project
   */
  switchTo(instanceName: string, projectName?: string): ActiveConfig {
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceName}`);
    }

    const projects = instance.projects || [];

    // If no project specified, use default or first project
    let targetProject: SkySparkProject;
    if (!projectName) {
      // Use defaultProjName if specified, otherwise first project
      if (instance.defaultProjName) {
        const foundProject = projects.find(p => p.name === instance.defaultProjName);
        if (!foundProject) {
          throw new Error(`Default project not found: ${instance.defaultProjName} in instance ${instanceName}`);
        }
        targetProject = foundProject;
      } else {
        if (projects.length === 0) {
          throw new Error(`No projects available in instance ${instanceName}`);
        }
        targetProject = projects[0];
      }
    } else {
      const foundProject = projects.find(p => p.name === projectName);
      if (!foundProject) {
        throw new Error(`Project not found: ${projectName} in instance ${instanceName}`);
      }
      targetProject = foundProject;
    }

    // Get effective credentials (project-specific or instance-level)
    const credentials = this.getProjectCredentials(instanceName, targetProject.name);

    // Create project with effective credentials
    const effectiveProject: SkySparkProject = {
      ...targetProject,
      username: credentials.username,
      password: credentials.password
    };

    this.activeConfig = {
      instance,
      project: effectiveProject,
      format: this.activeConfig?.format || 'zinc'
    };

    return this.activeConfig;
  }

  /**
   * Switch to instance with flexible lookup and optional project
   */
  switchToInstance(instanceName: string, projectName?: string): ActiveConfig {
    const instance = this.findInstanceByName(instanceName);
    if (!instance) {
      const availableInstances = Array.from(this.instances.keys()).join(', ');
      const availableFilenames = Array.from(this.filenameToInstance.keys()).join(', ');
      throw new Error(`Instance not found: ${instanceName}. Available instances: ${availableInstances}. Available filenames: ${availableFilenames}`);
    }

    return this.switchTo(instance.name, projectName);
  }
  
  /**
   * Add a new instance configuration
   */
  addInstance(instance: SkySparkInstance) {
    this.instances.set(instance.name, instance);
    this.saveInstanceConfig(instance);
  }
  
  /**
   * Save instance configuration to file
   */
  private saveInstanceConfig(instance: SkySparkInstance) {
    const configPath = path.resolve(this.configDir);
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    }
    
    // Use the original filename if we have it, otherwise use instance.name.json
    const filename = this.instanceFilenames.get(instance.name) || `${instance.name}.json`;
    const filePath = path.join(configPath, filename);
    
    console.error(`  💾 Saving config: ${filename} (${instance.projects.length} projects)`);
    fs.writeFileSync(filePath, JSON.stringify(instance, null, 2));
    console.error(`  ✅ Config saved successfully`);
    
    // Track the filename for future saves
    if (!this.instanceFilenames.has(instance.name)) {
      this.instanceFilenames.set(instance.name, filename);
    }

    // Update filename mapping
    const filenameWithoutExt = filename.replace(/\.json$/, '');
    this.filenameToInstance.set(filenameWithoutExt, instance.name);
  }
  
  /**
   * Get connection URL for active configuration
   */
  getActiveUrl(): string {
    const { instance, project } = this.getActiveConfig();
    return `${instance.protocol}://${instance.host}:${instance.port}/api/${project.name}`;
  }
  
  /**
   * Get all projects across all instances
   */
  getAllProjects(): { instance: string; project: string; description?: string }[] {
    const projects: { instance: string; project: string; description?: string }[] = [];

    for (const [instanceName, instance] of this.instances) {
      for (const project of (instance.projects || [])) {
        projects.push({
          instance: instanceName,
          project: project.name,
          description: project.description
        });
      }
    }

    return projects;
  }
  
  /**
   * Add a project to an existing instance
   */
  addProject(instanceName: string, project: SkySparkProject): void {
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceName}`);
    }

    // Initialize projects array if needed
    if (!instance.projects) {
      instance.projects = [];
    }

    // Check if project already exists
    const exists = instance.projects.some(p => p.name === project.name);
    if (exists) {
      throw new Error(`Project ${project.name} already exists in instance ${instanceName}`);
    }

    instance.projects.push(project);
    this.saveInstanceConfig(instance);
  }
  
  /**
   * Update instance configuration with new projects
   */
  updateInstanceProjects(instanceName: string, projects: SkySparkProject[]): void {
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceName}`);
    }
    
    console.error(`  🔄 Updating ${instanceName}: ${instance.projects.length} → ${projects.length} projects`);
    instance.projects = projects;
    this.saveInstanceConfig(instance);
  }
}
