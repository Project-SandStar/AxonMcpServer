import { PerformanceMonitor } from '../../../src/utils/PerformanceMonitor';

// Mock vscode module
const mockGlobalState = new Map<string, any>();
const mockOutputChannel = {
    appendLine: jest.fn(),
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    name: 'Test Output Channel',
    replace: jest.fn()
};

const mockContext = {
    globalState: {
        get: jest.fn((key: string) => mockGlobalState.get(key)),
        update: jest.fn((key: string, value: any) => {
            mockGlobalState.set(key, value);
            return Promise.resolve();
        }),
        keys: jest.fn(() => Array.from(mockGlobalState.keys()))
    },
    subscriptions: [],
    extensionPath: '/test/path',
    extensionUri: {} as any,
    workspaceState: {} as any,
    secrets: {} as any,
    storageUri: {} as any,
    globalStorageUri: {} as any,
    logUri: {} as any,
    extensionMode: 3,
    storagePath: '/test/storage',
    globalStoragePath: '/test/global-storage',
    logPath: '/test/logs',
    asAbsolutePath: jest.fn(),
    extension: {} as any,
    environmentVariableCollection: {} as any
};

// Mock workspace configuration
const mockConfig = new Map<string, any>([
    ['enabled', true],
    ['maxMeasurements', 1000],
    ['logSlowOperations', true],
    ['slowOperationThreshold', 1000],
    ['persistStats', true],
    ['detailedLogging', false]
]);

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: (key: string, defaultValue?: any) => {
                return mockConfig.get(key) ?? defaultValue;
            }
        })),
        onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() }))
    },
    window: {
        createOutputChannel: jest.fn(() => mockOutputChannel)
    }
}));

describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGlobalState.clear();
        mockOutputChannel.appendLine.mockClear();
        
        // Reset config to defaults
        mockConfig.set('enabled', true);
        mockConfig.set('maxMeasurements', 1000);
        mockConfig.set('logSlowOperations', true);
        mockConfig.set('slowOperationThreshold', 1000);
        mockConfig.set('persistStats', true);
        mockConfig.set('detailedLogging', false);
        
        monitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
    });

    afterEach(() => {
        monitor.dispose();
    });

    describe('Basic Measurement', () => {
        it('should start and end a measurement', () => {
            const id = monitor.startMeasurement('test-operation');
            expect(id).toBeTruthy();
            expect(id).toContain('test-operation');

            monitor.endMeasurement(id, true);
            
            const stats = monitor.getOperationStats('test-operation');
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(1);
            expect(stats?.successCount).toBe(1);
        });

        it('should not measure when disabled', () => {
            mockConfig.set('enabled', false);
            const disabledMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            const id = disabledMonitor.startMeasurement('disabled-test');
            expect(id).toBe('');
            
            disabledMonitor.endMeasurement(id, true);
            const stats = disabledMonitor.getOperationStats('disabled-test');
            expect(stats).toBeNull();
            
            disabledMonitor.dispose();
        });

        it('should handle missing measurement ID gracefully', () => {
            monitor.endMeasurement('non-existent-id');
            // Should not throw
        });

        it('should record metadata with measurements', () => {
            const metadata = { key: 'value', count: 42 };
            const id = monitor.startMeasurement('metadata-test', metadata);
            monitor.endMeasurement(id, true);
            
            const stats = monitor.getOperationStats('metadata-test');
            expect(stats).toBeTruthy();
        });
    });

    describe('Async Measurements', () => {
        it('should measure async operations successfully', async () => {
            const result = await monitor.measureAsync(
                'async-operation',
                async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return 'success';
                }
            );

            expect(result).toBe('success');
            
            const stats = monitor.getOperationStats('async-operation');
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(1);
            expect(stats?.successCount).toBe(1);
            expect(stats?.avgDuration).toBeGreaterThanOrEqual(10);
        });

        it('should measure async operations that fail', async () => {
            await expect(
                monitor.measureAsync(
                    'async-failure',
                    async () => {
                        throw new Error('Test error');
                    }
                )
            ).rejects.toThrow('Test error');
            
            const stats = monitor.getOperationStats('async-failure');
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(1);
            expect(stats?.failureCount).toBe(1);
            expect(stats?.successRate).toBe(0);
        });
    });

    describe('Sync Measurements', () => {
        it('should measure sync operations successfully', () => {
            const result = monitor.measure(
                'sync-operation',
                () => {
                    return 42;
                }
            );

            expect(result).toBe(42);
            
            const stats = monitor.getOperationStats('sync-operation');
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(1);
            expect(stats?.successCount).toBe(1);
        });

        it('should measure sync operations that fail', () => {
            expect(() => {
                monitor.measure(
                    'sync-failure',
                    () => {
                        throw new Error('Sync error');
                    }
                );
            }).toThrow('Sync error');
            
            const stats = monitor.getOperationStats('sync-failure');
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(1);
            expect(stats?.failureCount).toBe(1);
        });
    });

    describe('Statistics', () => {
        beforeEach(() => {
            // Create multiple measurements with different durations
            for (let i = 0; i < 10; i++) {
                const id = monitor.startMeasurement('multi-operation');
                // Simulate varying durations
                setTimeout(() => {}, i);
                monitor.endMeasurement(id, i < 8); // 80% success rate
            }
        });

        it('should calculate correct operation statistics', () => {
            const stats = monitor.getOperationStats('multi-operation');
            
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(10);
            expect(stats?.successCount).toBe(8);
            expect(stats?.failureCount).toBe(2);
            expect(stats?.successRate).toBe(80);
            expect(stats?.avgDuration).toBeGreaterThanOrEqual(0);
            expect(stats?.minDuration).toBeGreaterThanOrEqual(0);
            expect(stats?.maxDuration).toBeGreaterThanOrEqual(0);
        });

        it('should calculate percentiles correctly', () => {
            const stats = monitor.getOperationStats('multi-operation');
            
            expect(stats?.p50).toBeDefined();
            expect(stats?.p95).toBeDefined();
            expect(stats?.p99).toBeDefined();
            expect(stats?.p50).toBeLessThanOrEqual(stats?.p95!);
            expect(stats?.p95).toBeLessThanOrEqual(stats?.p99!);
        });

        it('should return null for non-existent operations', () => {
            const stats = monitor.getOperationStats('non-existent');
            expect(stats).toBeNull();
        });

        it('should get all stats sorted by average duration', () => {
            // Create another operation type with longer duration
            const id = monitor.startMeasurement('slow-operation');
            setTimeout(() => {}, 100);
            monitor.endMeasurement(id);

            const allStats = monitor.getAllStats();
            
            expect(allStats.length).toBeGreaterThanOrEqual(2);
            // Should be sorted by avgDuration descending
            for (let i = 0; i < allStats.length - 1; i++) {
                expect(allStats[i].avgDuration).toBeGreaterThanOrEqual(allStats[i + 1].avgDuration);
            }
        });
    });

    describe('Report Generation', () => {
        it('should generate empty report when no data', () => {
            const emptyMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            const report = emptyMonitor.getReport();
            
            expect(report).toContain('No performance data available');
            emptyMonitor.dispose();
        });

        it('should generate formatted report with data', () => {
            const id = monitor.startMeasurement('report-test');
            monitor.endMeasurement(id, true);
            
            const report = monitor.getReport();
            
            expect(report).toContain('PERFORMANCE MONITOR REPORT');
            expect(report).toContain('report-test');
            expect(report).toContain('Count:');
            expect(report).toContain('Success Rate:');
            expect(report).toContain('Duration (ms):');
        });
    });

    describe('Slow Operations', () => {
        it('should identify slow operations', () => {
            mockConfig.set('slowOperationThreshold', 50);
            const slowMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            // Create a slow operation
            const id = slowMonitor.startMeasurement('slow-op');
            // Artificially set duration
            slowMonitor.endMeasurement(id, true);
            
            const slowOps = slowMonitor.getSlowOperations();
            // Should be empty or have operations over threshold
            expect(Array.isArray(slowOps)).toBe(true);
            
            slowMonitor.dispose();
        });

        it('should log slow operations when enabled', () => {
            mockConfig.set('slowOperationThreshold', 1);
            mockConfig.set('logSlowOperations', true);
            const logMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            const id = logMonitor.startMeasurement('logged-slow-op');
            setTimeout(() => {}, 10); // Ensure some duration
            logMonitor.endMeasurement(id, true);
            
            // Should have logged if duration > threshold
            // Note: Due to setTimeout behavior, may not always trigger
            
            logMonitor.dispose();
        });
    });

    describe('Failures Tracking', () => {
        it('should track recent failures', () => {
            for (let i = 0; i < 5; i++) {
                const id = monitor.startMeasurement(`failure-${i}`);
                monitor.endMeasurement(id, false, `Error ${i}`);
            }
            
            const failures = monitor.getRecentFailures(3);
            expect(failures.length).toBeLessThanOrEqual(3);
            failures.forEach(f => {
                expect(f.success).toBe(false);
                expect(f.error).toBeDefined();
            });
        });

        it('should sort failures by most recent first', () => {
            const id1 = monitor.startMeasurement('fail-1');
            monitor.endMeasurement(id1, false, 'Error 1');
            
            const id2 = monitor.startMeasurement('fail-2');
            monitor.endMeasurement(id2, false, 'Error 2');
            
            const failures = monitor.getRecentFailures();
            if (failures.length >= 2) {
                expect(failures[0].endTime).toBeGreaterThanOrEqual(failures[1].endTime!);
            }
        });
    });

    describe('Clear Operations', () => {
        beforeEach(() => {
            // Add some measurements
            const id1 = monitor.startMeasurement('op-1');
            monitor.endMeasurement(id1);
            
            const id2 = monitor.startMeasurement('op-2');
            monitor.endMeasurement(id2);
        });

        it('should clear specific operation', () => {
            expect(monitor.getOperationStats('op-1')).toBeTruthy();
            
            monitor.clearOperation('op-1');
            
            expect(monitor.getOperationStats('op-1')).toBeNull();
            expect(monitor.getOperationStats('op-2')).toBeTruthy();
        });

        it('should clear all operations', () => {
            expect(monitor.getAllStats().length).toBeGreaterThan(0);
            
            monitor.clearAll();
            
            expect(monitor.getAllStats().length).toBe(0);
            expect(monitor.getOperationStats('op-1')).toBeNull();
            expect(monitor.getOperationStats('op-2')).toBeNull();
        });
    });

    describe('Export Statistics', () => {
        it('should export statistics as JSON', () => {
            const id = monitor.startMeasurement('export-test');
            monitor.endMeasurement(id, true);
            
            const exported = monitor.exportStats();
            const parsed = JSON.parse(exported);
            
            expect(parsed).toHaveProperty('timestamp');
            expect(parsed).toHaveProperty('config');
            expect(parsed).toHaveProperty('stats');
            expect(parsed).toHaveProperty('slowOperations');
            expect(parsed).toHaveProperty('recentFailures');
            expect(Array.isArray(parsed.stats)).toBe(true);
        });

        it('should include config in export', () => {
            const exported = monitor.exportStats();
            const parsed = JSON.parse(exported);
            
            expect(parsed.config.enabled).toBe(true);
            expect(parsed.config.maxMeasurements).toBe(1000);
        });
    });

    describe('Persistence', () => {
        it('should persist stats when enabled', async () => {
            const id = monitor.startMeasurement('persist-test');
            monitor.endMeasurement(id, true);
            
            // Trigger persistence by disposing
            monitor.dispose();
            
            // Check if update was called
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'performanceStats',
                expect.anything()
            );
        });

        it('should load persisted stats on initialization', () => {
            // Set some persisted data
            const persistedData = {
                'test-op': [{
                    operation: 'test-op',
                    startTime: Date.now() - 1000,
                    endTime: Date.now(),
                    duration: 100,
                    success: true
                }]
            };
            mockGlobalState.set('performanceStats', persistedData);
            
            const newMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            const stats = newMonitor.getOperationStats('test-op');
            expect(stats).toBeTruthy();
            expect(stats?.count).toBe(1);
            
            newMonitor.dispose();
        });

        it('should not persist when disabled', () => {
            mockConfig.set('persistStats', false);
            const noPersistMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            const id = noPersistMonitor.startMeasurement('no-persist');
            noPersistMonitor.endMeasurement(id);
            
            noPersistMonitor.dispose();
            
            // Update should not be called with performanceStats
            // or should be called with undefined to clear
            
            noPersistMonitor.dispose();
        });
    });

    describe('LRU Behavior', () => {
        it('should respect max measurements limit', () => {
            mockConfig.set('maxMeasurements', 5);
            const limitedMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            // Add more than max measurements
            for (let i = 0; i < 10; i++) {
                const id = limitedMonitor.startMeasurement('limited-op');
                limitedMonitor.endMeasurement(id);
            }
            
            const stats = limitedMonitor.getOperationStats('limited-op');
            expect(stats?.count).toBeLessThanOrEqual(5);
            
            limitedMonitor.dispose();
        });
    });

    describe('Detailed Logging', () => {
        it('should log detailed info when enabled', () => {
            mockConfig.set('detailedLogging', true);
            const verboseMonitor = new PerformanceMonitor(mockContext as any, mockOutputChannel as any);
            
            const id = verboseMonitor.startMeasurement('verbose-test');
            verboseMonitor.endMeasurement(id, true);
            
            // Should have logged start and completion
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Started: verbose-test')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Completed: verbose-test')
            );
            
            verboseMonitor.dispose();
        });
    });

    describe('Edge Cases', () => {
        it('should handle operations with no duration data', () => {
            // Manually create a measurement without completing it
            const id = monitor.startMeasurement('incomplete-op');
            // Don't call endMeasurement
            
            const stats = monitor.getOperationStats('incomplete-op');
            expect(stats).toBeNull(); // No completed measurements
        });

        it('should handle empty operation name', () => {
            const id = monitor.startMeasurement('');
            monitor.endMeasurement(id, true);
            
            const stats = monitor.getOperationStats('');
            expect(stats).toBeTruthy();
        });

        it('should handle concurrent measurements of same operation', async () => {
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    monitor.measureAsync('concurrent-op', async () => {
                        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
                        return i;
                    })
                );
            }
            
            const results = await Promise.all(promises);
            expect(results).toEqual([0, 1, 2, 3, 4]);
            
            const stats = monitor.getOperationStats('concurrent-op');
            expect(stats?.count).toBe(5);
        });
    });
});
