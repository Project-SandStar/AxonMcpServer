import { PerformanceMonitor } from './PerformanceMonitor';

/**
 * Global performance monitor instance
 * This is set during extension activation
 */
let performanceMonitorInstance: PerformanceMonitor | null = null;

/**
 * Set the global performance monitor instance
 * Called during extension activation
 */
export function setPerformanceMonitor(monitor: PerformanceMonitor): void {
    performanceMonitorInstance = monitor;
}

/**
 * Get the global performance monitor instance
 * Returns null if not initialized yet
 */
export function getPerformanceMonitor(): PerformanceMonitor | null {
    return performanceMonitorInstance;
}

/**
 * Measure an async operation with the performance monitor
 * Safe to call even if performance monitor is not initialized
 */
export async function measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
): Promise<T> {
    if (performanceMonitorInstance) {
        return performanceMonitorInstance.measureAsync(operation, fn, metadata);
    }
    // If no monitor, just execute the function
    return fn();
}

/**
 * Measure a sync operation with the performance monitor
 * Safe to call even if performance monitor is not initialized
 */
export function measure<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, any>
): T {
    if (performanceMonitorInstance) {
        return performanceMonitorInstance.measure(operation, fn, metadata);
    }
    // If no monitor, just execute the function
    return fn();
}
