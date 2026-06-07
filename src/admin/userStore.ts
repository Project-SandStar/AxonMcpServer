/**
 * User management store for the Axon MCP Server
 * Stores users in a JSON file with bcrypt-hashed passwords
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
}

export interface UserPublic {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
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
    const user = this.users.get(username.toLowerCase());
    if (!user) return null;

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
    return Array.from(this.users.values()).map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
    }));
  }

  /**
   * Get a user by username (without password hash)
   */
  getUser(username: string): UserPublic | null {
    const user = this.users.get(username.toLowerCase());
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    };
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

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    };
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
