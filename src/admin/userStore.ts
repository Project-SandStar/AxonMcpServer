/**
 * User management store for the Axon MCP Server
 * Stores users in a JSON file with bcrypt-hashed passwords
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * "Sidecar sync login" of a user. The sync password is write-only: the
 * receiver keeps its Argon2 hash in receiver.toml, this app keeps no hash.
 */
export interface SidecarSyncLogin {
  enabled: boolean;
  /** Root names this login may send. Empty = all roots. */
  roots: string[];
  /** When the login was linked to (or made on) the receiver. */
  linkedAt?: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
  /** false = the user can not log in to the dashboard (sync-only user). Missing = true. */
  dashboardLogin?: boolean;
  sidecarSync?: SidecarSyncLogin;
}

export interface UserPublic {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
  dashboardLogin: boolean;
  sidecarSync?: SidecarSyncLogin;
}

function toPublic(u: User): UserPublic {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    dashboardLogin: u.dashboardLogin !== false,
    ...(u.sidecarSync ? { sidecarSync: { ...u.sidecarSync, roots: [...u.sidecarSync.roots] } } : {}),
  };
}

interface UsersData {
  users: User[];
}

// Simple password hashing using PBKDF2 (no external dependencies)
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return { hash: `${useSalt}:${hash}`, salt: useSalt };
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const { hash: computedHash } = hashPassword(password, salt);
  return storedHash === computedHash;
}

export class UserStore {
  private usersFile: string;
  private users: Map<string, User> = new Map();

  constructor(configDir: string) {
    this.usersFile = path.join(configDir, 'users.json');
    this.loadUsers();
  }

  private loadUsers(): void {
    if (fs.existsSync(this.usersFile)) {
      try {
        const data: UsersData = JSON.parse(fs.readFileSync(this.usersFile, 'utf-8'));
        this.users.clear();
        for (const user of data.users) {
          this.users.set(user.username.toLowerCase(), user);
        }
        console.error(`[UserStore] Loaded ${this.users.size} users`);
      } catch (error) {
        console.error('[UserStore] Failed to load users:', error);
        this.initializeDefaultUser();
      }
    } else {
      this.initializeDefaultUser();
    }
  }

  private initializeDefaultUser(): void {
    console.error('[UserStore] Initializing with default admin user');
    const defaultUser: User = {
      id: crypto.randomUUID(),
      username: 'admin',
      passwordHash: hashPassword('admin').hash,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    this.users.set('admin', defaultUser);
    this.saveUsers();
  }

  private saveUsers(): void {
    try {
      const data: UsersData = {
        users: Array.from(this.users.values()),
      };
      fs.writeFileSync(this.usersFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[UserStore] Failed to save users:', error);
    }
  }

  /**
   * Authenticate a user
   */
  authenticate(username: string, password: string): User | null {
    const user = this.users.get((username || '').toLowerCase());
    if (!user || user.dashboardLogin === false) return null;

    if (verifyPassword(password, user.passwordHash)) {
      // Update last login
      user.lastLogin = new Date().toISOString();
      this.saveUsers();
      return user;
    }
    return null;
  }

  /**
   * Get all users (without password hashes)
   */
  getAllUsers(): UserPublic[] {
    return Array.from(this.users.values()).map(toPublic);
  }

  /**
   * Get a user by username (without password hash)
   */
  getUser(username: string): UserPublic | null {
    const user = this.users.get(username.toLowerCase());
    return user ? toPublic(user) : null;
  }

  /**
   * Create a new user
   */
  createUser(username: string, password: string, role: 'admin' | 'user' = 'user'): UserPublic | null {
    if (this.users.has(username.toLowerCase())) {
      return null; // User already exists
    }

    const user: User = {
      id: crypto.randomUUID(),
      username: username.toLowerCase(),
      passwordHash: hashPassword(password).hash,
      role,
      createdAt: new Date().toISOString(),
    };

    this.users.set(username.toLowerCase(), user);
    this.saveUsers();

    return toPublic(user);
  }

  /**
   * Create a sync-only user for an existing receiver account: role "user",
   * dashboard login off, random dashboard password nobody knows.
   */
  createSyncOnlyUser(username: string, sync: SidecarSyncLogin): UserPublic | null {
    const key = username.toLowerCase();
    if (this.users.has(key)) return null;
    const user: User = {
      id: crypto.randomUUID(),
      username: key,
      passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')).hash,
      role: 'user',
      createdAt: new Date().toISOString(),
      dashboardLogin: false,
      sidecarSync: { enabled: sync.enabled, roots: [...sync.roots], ...(sync.linkedAt ? { linkedAt: sync.linkedAt } : {}) },
    };
    this.users.set(key, user);
    this.saveUsers();
    return toPublic(user);
  }

  /** Turn dashboard login on or off. Refuses to lock out the last admin who can log in. */
  setDashboardLogin(username: string, on: boolean): boolean {
    const user = this.users.get(username.toLowerCase());
    if (!user) return false;
    if (!on && user.role === 'admin') {
      const others = Array.from(this.users.values())
        .filter(u => u.role === 'admin' && u.dashboardLogin !== false && u !== user);
      if (others.length === 0) return false;
    }
    user.dashboardLogin = on;
    this.saveUsers();
    return true;
  }

  /** Save the sidecar sync login settings (never a password). */
  setSidecarSync(username: string, sync: SidecarSyncLogin | undefined): boolean {
    const user = this.users.get(username.toLowerCase());
    if (!user) return false;
    if (sync) user.sidecarSync = { enabled: sync.enabled, roots: [...sync.roots], ...(sync.linkedAt ? { linkedAt: sync.linkedAt } : {}) };
    else delete user.sidecarSync;
    this.saveUsers();
    return true;
  }

  /**
   * Update a user's password
   */
  updatePassword(username: string, newPassword: string): boolean {
    const user = this.users.get(username.toLowerCase());
    if (!user) return false;

    user.passwordHash = hashPassword(newPassword).hash;
    this.saveUsers();
    return true;
  }

  /**
   * Update a user's role
   */
  updateRole(username: string, role: 'admin' | 'user'): boolean {
    const user = this.users.get(username.toLowerCase());
    if (!user) return false;

    user.role = role;
    this.saveUsers();
    return true;
  }

  /**
   * Delete a user
   */
  deleteUser(username: string): boolean {
    // Prevent deleting the last admin
    const admins = Array.from(this.users.values()).filter(u => u.role === 'admin');
    const user = this.users.get(username.toLowerCase());

    if (user?.role === 'admin' && admins.length <= 1) {
      return false; // Cannot delete the last admin
    }

    const deleted = this.users.delete(username.toLowerCase());
    if (deleted) {
      this.saveUsers();
    }
    return deleted;
  }

  /**
   * Check if a user exists
   */
  userExists(username: string): boolean {
    return this.users.has(username.toLowerCase());
  }
}

// Singleton instance
let userStoreInstance: UserStore | null = null;

export function initUserStore(configDir: string): UserStore {
  if (!userStoreInstance) {
    userStoreInstance = new UserStore(configDir);
  }
  return userStoreInstance;
}

export function getUserStore(): UserStore | null {
  return userStoreInstance;
}
