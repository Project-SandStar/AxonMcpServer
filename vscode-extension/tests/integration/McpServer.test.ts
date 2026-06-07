import * as vscode from 'vscode';
import { McpServerManager } from '../../src/mcp/McpServerManager';
import { McpClient } from '../../src/mcp/McpClient';

/**
 * Integration tests for MCP Server
 * 
 * These tests verify the MCP server lifecycle, communication,
 * health monitoring, and auto-restart functionality.
 */
describe('MCP Server Integration Tests', () => {
  let mcpManager: McpServerManager;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    // Create a minimal mock context
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => [])
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
        setKeysForSync: jest.fn()
      },
      extensionPath: __dirname,
      extensionUri: vscode.Uri.file(__dirname),
      environmentVariableCollection: {} as any,
      extensionMode: vscode.ExtensionMode.Test,
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file(__dirname),
      logUri: vscode.Uri.file(__dirname),
      storagePath: undefined,
      globalStoragePath: __dirname,
      logPath: __dirname,
      asAbsolutePath: (relativePath: string) => relativePath,
      secrets: {} as any,
      extension: {} as any,
      languageModelAccessInformation: {} as any
    } as vscode.ExtensionContext;

    mcpManager = new McpServerManager(mockContext);
  });

  afterEach(async () => {
    // Clean up - stop the server if running
    if (mcpManager.isRunning()) {
      await mcpManager.stop();
    }
  });

  describe('Server Lifecycle', () => {
    test('should start MCP server successfully', async () => {
      await mcpManager.start();
      
      expect(mcpManager.isRunning()).toBe(true);
      expect(mcpManager.getPid()).toBeDefined();
      expect(mcpManager.getUptime()).toBeGreaterThan(0);
    }, 15000); // 15 second timeout for server startup

    test('should stop MCP server successfully', async () => {
      await mcpManager.start();
      expect(mcpManager.isRunning()).toBe(true);
      
      await mcpManager.stop();
      
      expect(mcpManager.isRunning()).toBe(false);
      expect(mcpManager.getPid()).toBeUndefined();
    }, 15000);

    test('should restart MCP server successfully', async () => {
      await mcpManager.start();
      const firstPid = mcpManager.getPid();
      
      await mcpManager.restart();
      
      const secondPid = mcpManager.getPid();
      expect(mcpManager.isRunning()).toBe(true);
      expect(secondPid).toBeDefined();
      // PIDs should be different after restart
      expect(secondPid).not.toBe(firstPid);
    }, 20000);

    test('should not start server twice', async () => {
      await mcpManager.start();
      const firstPid = mcpManager.getPid();
      
      // Try to start again
      await mcpManager.start();
      
      const secondPid = mcpManager.getPid();
      expect(secondPid).toBe(firstPid);
    }, 15000);
  });

  describe('JSON-RPC Communication', () => {
    beforeEach(async () => {
      await mcpManager.start();
    }, 15000);

    test('should ping MCP server successfully', async () => {
      const client = mcpManager.getClient();
      const result = await client.ping();
      
      expect(result).toBe(true);
    });

    test('should handle concurrent requests', async () => {
      const client = mcpManager.getClient();
      
      // Send multiple ping requests concurrently
      const promises = Array.from({ length: 5 }, () => client.ping());
      const results = await Promise.all(promises);
      
      // All requests should succeed
      expect(results.every(r => r === true)).toBe(true);
    });

    test('should handle tool calls', async () => {
      const client = mcpManager.getClient();
      
      // List available tools
      const tools = await client.callTool('tools/list', {});
      
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
    });

    test('should search Axon examples', async () => {
      const client = mcpManager.getClient();
      
      const results = await client.callTool('search_axon_examples', {
        query: 'point',
        limit: 5
      });
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    test('should search Axon documentation', async () => {
      const client = mcpManager.getClient();
      
      const results = await client.callTool('search_axon_docs', {
        query: 'filter',
        limit: 5
      });
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Health Monitoring', () => {
    test('should report healthy status when running', async () => {
      await mcpManager.start();
      
      const status = mcpManager.getStatus();
      
      expect(status.running).toBe(true);
      expect(status.pid).toBeDefined();
      expect(status.uptime).toBeGreaterThan(0);
    }, 15000);

    test('should report unhealthy status when stopped', async () => {
      await mcpManager.start();
      await mcpManager.stop();
      
      const status = mcpManager.getStatus();
      
      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
    }, 15000);
  });

  describe('Auto-Restart', () => {
    test('should attempt auto-restart on unexpected exit', async () => {
      await mcpManager.start();
      const firstPid = mcpManager.getPid();
      
      // Kill the process unexpectedly
      if (firstPid) {
        process.kill(firstPid, 'SIGKILL');
      }
      
      // Wait for auto-restart (up to 5 seconds)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Server should have restarted
      const newStatus = mcpManager.getStatus();
      expect(newStatus.running).toBe(true);
      expect(newStatus.pid).toBeDefined();
      expect(newStatus.pid).not.toBe(firstPid);
    }, 20000);
  });

  describe('Error Handling', () => {
    test('should handle invalid tool calls gracefully', async () => {
      await mcpManager.start();
      const client = mcpManager.getClient();
      
      await expect(
        client.callTool('nonexistent_tool', {})
      ).rejects.toThrow();
    }, 15000);

    test('should handle communication errors', async () => {
      const client = mcpManager.getClient();
      
      // Try to ping when server is not running
      await expect(client.ping()).rejects.toThrow();
    });
  });

  describe('Status Reporting', () => {
    test('should return correct status when stopped', () => {
      const status = mcpManager.getStatus();
      
      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
      expect(status.uptime).toBeUndefined();
    });

    test('should return correct status when running', async () => {
      await mcpManager.start();
      
      const status = mcpManager.getStatus();
      
      expect(status.running).toBe(true);
      expect(status.pid).toBeGreaterThan(0);
      expect(status.uptime).toBeGreaterThan(0);
    }, 15000);

    test('should update uptime correctly', async () => {
      await mcpManager.start();
      
      const firstUptime = mcpManager.getUptime();
      
      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const secondUptime = mcpManager.getUptime();
      
      expect(secondUptime).toBeGreaterThan(firstUptime!);
    }, 17000);
  });
});
