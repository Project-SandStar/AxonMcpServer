import * as vscode from 'vscode';

/**
 * Represents a single performance measurement
 */
interface PerformanceMeasurement {
    operation: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    metadata?: Record<string, any>;
    success?: boolean;
    error?: string;
}

/**
 * Aggregated statistics for an operation type
 */
interface OperationStats {
    operation: string;
    count: number;
    totalDuration: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    lastExecuted?: number;
    p50?: number;
    p95?: number;
    p99?: number;
}

/**
 * Configuration for performance monitoring
 */
interface PerformanceMonitorConfig {
    enabled: boolean;
    maxMeasurements: number;
    logSlowOperations: boolean;
    slowOperationThreshold: number; // milliseconds
    persistStats: boolean;
    detailedLogging: boolean;
}

/**
 * Performance monitor utility for tracking and analyzing operation performance
 */
export class PerformanceMonitor implements vscode.Disposable {
    private measurements: Map<string, PerformanceMeasurement[]> = new Map();
    private activeMeasurements: Map<string, PerformanceMeasurement> = new Map();
    private config: PerformanceMonitorConfig;
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        
        // Load configuration
        this.config = this.loadConfig();
        
        // Load persisted stats if enabled
        if (this.config.persistStats) {
            this.loadPersistedStats();
        }

        // Register configuration change listener
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('axonMcp.performance')) {
                    this.config = this.loadConfig();
                }
            })
        );
    }

    /**
     * Load configuration from VSCode settings
     */
    private loadConfig(): PerformanceMonitorConfig {
        const config = vscode.workspace.getConfiguration('axonMcp.performance');
        return {
            enabled: config.get('enabled', true),
            maxMeasurements: config.get('maxMeasurements', 1000),
            logSlowOperations: config.get('logSlowOperations', true),
            slowOperationThreshold: config.get('slowOperationThreshold', 1000),
            persistStats: config.get('persistStats', true),
            detailedLogging: config.get('detailedLogging', false)
        };
    }

    /**
     * Start measuring an operation
     */
    startMeasurement(operation: string, metadata?: Record<string, any>): string {
        if (!this.config.enabled) {
            return '';
        }

        const measurementId = `${operation}-${Date.now()}-${Math.random()}`;
        const measurement: PerformanceMeasurement = {
            operation,
            startTime: Date.now(),
            metadata
        };

        this.activeMeasurements.set(measurementId, measurement);

        if (this.config.detailedLogging) {
            this.outputChannel.appendLine(
                `[PerformanceMonitor] Started: ${operation} (${measurementId})`
            );
        }

        return measurementId;
    }

    /**
     * End a measurement and record the results
     */
    endMeasurement(measurementId: string, success: boolean = true, error?: string): void {
        if (!this.config.enabled || !measurementId) {
            return;
        }

        const measurement = this.activeMeasurements.get(measurementId);
        if (!measurement) {
            return;
        }

        measurement.endTime = Date.now();
        measurement.duration = measurement.endTime - measurement.startTime;
        measurement.success = success;
        measurement.error = error;

        // Store the measurement
        const operationMeasurements = this.measurements.get(measurement.operation) || [];
        operationMeasurements.push(measurement);

        // Limit stored measurements
        if (operationMeasurements.length > this.config.maxMeasurements) {
            operationMeasurements.shift();
        }

        this.measurements.set(measurement.operation, operationMeasurements);

        // Remove from active measurements
        this.activeMeasurements.delete(measurementId);

        // Log slow operations
        if (
            this.config.logSlowOperations &&
            measurement.duration >= this.config.slowOperationThreshold
        ) {
            this.outputChannel.appendLine(
                `[PerformanceMonitor] SLOW: ${measurement.operation} took ${measurement.duration}ms`
            );
        }

        if (this.config.detailedLogging) {
            this.outputChannel.appendLine(
                `[PerformanceMonitor] Completed: ${measurement.operation} in ${measurement.duration}ms (success: ${success})`
            );
        }

        // Persist if enabled
        if (this.config.persistStats) {
            this.persistStats();
        }
    }

    /**
     * Measure an async operation
     */
    async measureAsync<T>(
        operation: string,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const measurementId = this.startMeasurement(operation, metadata);
        
        try {
            const result = await fn();
            this.endMeasurement(measurementId, true);
            return result;
        } catch (error) {
            this.endMeasurement(measurementId, false, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Measure a synchronous operation
     */
    measure<T>(
        operation: string,
        fn: () => T,
        metadata?: Record<string, any>
    ): T {
        const measurementId = this.startMeasurement(operation, metadata);
        
        try {
            const result = fn();
            this.endMeasurement(measurementId, true);
            return result;
        } catch (error) {
            this.endMeasurement(measurementId, false, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Get statistics for a specific operation
     */
    getOperationStats(operation: string): OperationStats | null {
        const measurements = this.measurements.get(operation);
        if (!measurements || measurements.length === 0) {
            return null;
        }

        const durations = measurements
            .filter(m => m.duration !== undefined)
            .map(m => m.duration!);

        if (durations.length === 0) {
            return null;
        }

        const sortedDurations = [...durations].sort((a, b) => a - b);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        const successCount = measurements.filter(m => m.success).length;
        const failureCount = measurements.filter(m => !m.success).length;

        return {
            operation,
            count: measurements.length,
            totalDuration,
            avgDuration: totalDuration / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            successCount,
            failureCount,
            successRate: (successCount / measurements.length) * 100,
            lastExecuted: measurements[measurements.length - 1].endTime,
            p50: this.getPercentile(sortedDurations, 0.5),
            p95: this.getPercentile(sortedDurations, 0.95),
            p99: this.getPercentile(sortedDurations, 0.99)
        };
    }

    /**
     * Get statistics for all operations
     */
    getAllStats(): OperationStats[] {
        const stats: OperationStats[] = [];
        
        for (const operation of this.measurements.keys()) {
            const operationStats = this.getOperationStats(operation);
            if (operationStats) {
                stats.push(operationStats);
            }
        }

        return stats.sort((a, b) => b.avgDuration - a.avgDuration);
    }

    /**
     * Get a formatted report of all statistics
     */
    getReport(): string {
        const stats = this.getAllStats();
        
        if (stats.length === 0) {
            return 'No performance data available.';
        }

        const lines: string[] = [
            '═══════════════════════════════════════════════════════════════════════════',
            '                        PERFORMANCE MONITOR REPORT',
            '═══════════════════════════════════════════════════════════════════════════',
            ''
        ];

        for (const stat of stats) {
            lines.push(`Operation: ${stat.operation}`);
            lines.push(`  Count:        ${stat.count}`);
            lines.push(`  Success Rate: ${stat.successRate.toFixed(2)}% (${stat.successCount}/${stat.count})`);
            lines.push(`  Duration (ms):`);
            lines.push(`    Average:    ${stat.avgDuration.toFixed(2)}`);
            lines.push(`    Min:        ${stat.minDuration.toFixed(2)}`);
            lines.push(`    Max:        ${stat.maxDuration.toFixed(2)}`);
            lines.push(`    P50:        ${stat.p50?.toFixed(2) || 'N/A'}`);
            lines.push(`    P95:        ${stat.p95?.toFixed(2) || 'N/A'}`);
            lines.push(`    P99:        ${stat.p99?.toFixed(2) || 'N/A'}`);
            lines.push(`  Total Time:   ${stat.totalDuration.toFixed(2)}ms`);
            
            if (stat.lastExecuted) {
                const lastExecutedDate = new Date(stat.lastExecuted);
                lines.push(`  Last Executed: ${lastExecutedDate.toISOString()}`);
            }
            
            lines.push('');
        }

        lines.push('═══════════════════════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    /**
     * Get recent slow operations
     */
    getSlowOperations(limit: number = 10): PerformanceMeasurement[] {
        const allMeasurements: PerformanceMeasurement[] = [];
        
        for (const measurements of this.measurements.values()) {
            allMeasurements.push(...measurements);
        }

        return allMeasurements
            .filter(m => m.duration && m.duration >= this.config.slowOperationThreshold)
            .sort((a, b) => (b.duration || 0) - (a.duration || 0))
            .slice(0, limit);
    }

    /**
     * Get recent failures
     */
    getRecentFailures(limit: number = 10): PerformanceMeasurement[] {
        const allMeasurements: PerformanceMeasurement[] = [];
        
        for (const measurements of this.measurements.values()) {
            allMeasurements.push(...measurements);
        }

        return allMeasurements
            .filter(m => !m.success)
            .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
            .slice(0, limit);
    }

    /**
     * Clear all measurements for a specific operation
     */
    clearOperation(operation: string): void {
        this.measurements.delete(operation);
        
        if (this.config.persistStats) {
            this.persistStats();
        }
    }

    /**
     * Clear all measurements
     */
    clearAll(): void {
        this.measurements.clear();
        this.activeMeasurements.clear();
        
        if (this.config.persistStats) {
            this.context.globalState.update('performanceStats', undefined);
        }
    }

    /**
     * Calculate percentile from sorted array
     */
    private getPercentile(sortedValues: number[], percentile: number): number {
        const index = Math.ceil(sortedValues.length * percentile) - 1;
        return sortedValues[Math.max(0, index)];
    }

    /**
     * Persist statistics to global state
     */
    private async persistStats(): Promise<void> {
        try {
            // Convert measurements to serializable format
            const statsData: Record<string, any[]> = {};
            
            for (const [operation, measurements] of this.measurements.entries()) {
                // Only store last 100 measurements per operation to limit storage
                statsData[operation] = measurements.slice(-100).map(m => ({
                    operation: m.operation,
                    startTime: m.startTime,
                    endTime: m.endTime,
                    duration: m.duration,
                    success: m.success,
                    error: m.error,
                    // Don't persist large metadata objects
                    metadata: m.metadata ? Object.keys(m.metadata).length : 0
                }));
            }

            await this.context.globalState.update('performanceStats', statsData);
        } catch (error) {
            this.outputChannel.appendLine(
                `[PerformanceMonitor] Error persisting stats: ${error}`
            );
        }
    }

    /**
     * Load persisted statistics from global state
     */
    private loadPersistedStats(): void {
        try {
            const statsData = this.context.globalState.get<Record<string, any[]>>('performanceStats');
            
            if (statsData) {
                for (const [operation, measurements] of Object.entries(statsData)) {
                    this.measurements.set(operation, measurements as PerformanceMeasurement[]);
                }
                
                this.outputChannel.appendLine(
                    `[PerformanceMonitor] Loaded ${this.measurements.size} operation types from persisted stats`
                );
            }
        } catch (error) {
            this.outputChannel.appendLine(
                `[PerformanceMonitor] Error loading persisted stats: ${error}`
            );
        }
    }

    /**
     * Export statistics as JSON
     */
    exportStats(): string {
        const stats = this.getAllStats();
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            config: this.config,
            stats,
            slowOperations: this.getSlowOperations(),
            recentFailures: this.getRecentFailures()
        }, null, 2);
    }

    /**
     * Dispose and cleanup
     */
    dispose(): void {
        if (this.config.persistStats) {
            this.persistStats();
        }
        
        this.disposables.forEach(d => d.dispose());
        this.measurements.clear();
        this.activeMeasurements.clear();
    }
}
