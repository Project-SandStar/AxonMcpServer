# Performance Monitor

The Performance Monitor is a comprehensive utility for tracking and analyzing the performance of operations in the Axon VSCode extension. It provides detailed metrics, statistics, and reporting capabilities to help identify bottlenecks and optimize performance.

## Features

- **Operation Timing**: Measure sync and async operations
- **Statistical Analysis**: Calculate min, max, average, and percentile metrics (P50, P95, P99)
- **Success Rate Tracking**: Monitor operation success and failure rates
- **Slow Operation Detection**: Automatically identify and log operations exceeding thresholds
- **Persistence**: Save and restore performance statistics across sessions
- **Reporting**: Generate comprehensive performance reports
- **Export**: Export statistics as JSON for external analysis
- **Configurable**: Fully configurable through VSCode settings

## Configuration

Performance monitoring can be configured through VSCode settings (`settings.json`):

```json
{
  "axonMcp.performance.enabled": true,
  "axonMcp.performance.maxMeasurements": 1000,
  "axonMcp.performance.logSlowOperations": true,
  "axonMcp.performance.slowOperationThreshold": 1000,
  "axonMcp.performance.persistStats": true,
  "axonMcp.performance.detailedLogging": false
}
```

### Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable performance monitoring |
| `maxMeasurements` | number | `1000` | Maximum measurements to store per operation (100-10000) |
| `logSlowOperations` | boolean | `true` | Automatically log slow operations |
| `slowOperationThreshold` | number | `1000` | Threshold in milliseconds for slow operations (100-10000) |
| `persistStats` | boolean | `true` | Persist statistics across VSCode sessions |
| `detailedLogging` | boolean | `false` | Enable detailed logging of all measurements |

## Usage

### Measuring Operations

#### Using the Global Instance

The easiest way to measure operations is through the global helper functions:

```typescript
import { measureAsync, measure } from './utils/performanceMonitorInstance';

// Measure async operations
const result = await measureAsync('database-query', async () => {
    return await database.query('SELECT * FROM users');
}, { table: 'users' });

// Measure sync operations
const processed = measure('data-processing', () => {
    return processData(rawData);
}, { recordCount: rawData.length });
```

#### Using the Monitor Instance Directly

```typescript
import { getPerformanceMonitor } from './utils/performanceMonitorInstance';

const monitor = getPerformanceMonitor();

// Manual measurement
const measurementId = monitor.startMeasurement('custom-operation', { 
    context: 'additional metadata' 
});

try {
    // Perform operation
    const result = await someOperation();
    monitor.endMeasurement(measurementId, true);
    return result;
} catch (error) {
    monitor.endMeasurement(measurementId, false, error.message);
    throw error;
}
```

### Viewing Statistics

#### Through VSCode Commands

1. **View Performance Report**: 
   - Command Palette → `Axon: View Performance Report`
   - Displays formatted report with all operation statistics

2. **Export Statistics**:
   - Command Palette → `Axon: Export Performance Statistics`
   - Exports detailed stats to a JSON file

3. **Clear Statistics**:
   - Command Palette → `Axon: Clear Performance Statistics`
   - Clears all collected performance data

#### Programmatically

```typescript
import { getPerformanceMonitor } from './utils/performanceMonitorInstance';

const monitor = getPerformanceMonitor();

// Get stats for a specific operation
const stats = monitor.getOperationStats('my-operation');
console.log(`Average duration: ${stats.avgDuration}ms`);
console.log(`Success rate: ${stats.successRate}%`);

// Get all stats
const allStats = monitor.getAllStats();
allStats.forEach(stat => {
    console.log(`${stat.operation}: ${stat.avgDuration}ms (${stat.count} calls)`);
});

// Get slow operations
const slowOps = monitor.getSlowOperations(10);
slowOps.forEach(op => {
    console.log(`${op.operation} took ${op.duration}ms`);
});

// Get recent failures
const failures = monitor.getRecentFailures(10);
failures.forEach(failure => {
    console.log(`${failure.operation} failed: ${failure.error}`);
});
```

## Performance Report Format

The performance report includes the following information for each operation:

```
═══════════════════════════════════════════════════════════════════════════
                        PERFORMANCE MONITOR REPORT
═══════════════════════════════════════════════════════════════════════════

Operation: database-query
  Count:        150
  Success Rate: 98.67% (148/150)
  Duration (ms):
    Average:    245.32
    Min:        89.45
    Max:        1203.67
    P50:        220.12
    P95:        456.89
    P99:        892.34
  Total Time:   36798.45ms
  Last Executed: 2025-01-15T14:30:45.123Z

Operation: data-processing
  Count:        523
  Success Rate: 100.00% (523/523)
  Duration (ms):
    Average:    12.45
    Min:        5.23
    Max:        87.12
    P50:        10.34
    P95:        23.45
    P99:        45.67
  Total Time:   6511.35ms
  Last Executed: 2025-01-15T14:32:12.456Z

═══════════════════════════════════════════════════════════════════════════
```

## Statistics Explained

### Duration Metrics

- **Average**: Mean duration of all measurements
- **Min**: Shortest duration recorded
- **Max**: Longest duration recorded
- **P50 (Median)**: 50% of measurements are faster than this
- **P95**: 95% of measurements are faster than this (useful for identifying outliers)
- **P99**: 99% of measurements are faster than this (captures extreme outliers)

### Success Metrics

- **Count**: Total number of measurements
- **Success Count**: Number of successful operations
- **Failure Count**: Number of failed operations
- **Success Rate**: Percentage of successful operations

### Percentiles

Percentiles are particularly useful for understanding performance characteristics:

- **P50 (Median)**: Typical performance for most operations
- **P95**: Good indicator of "worst case" performance under normal conditions
- **P99**: Captures edge cases and extreme scenarios

## Best Practices

### 1. Use Descriptive Operation Names

```typescript
// Good
measureAsync('mcp-query-examples', ...)
measureAsync('cache-lookup-semantic', ...)
measureAsync('ai-generate-function', ...)

// Less helpful
measureAsync('query', ...)
measureAsync('lookup', ...)
measureAsync('generate', ...)
```

### 2. Include Relevant Metadata

```typescript
measureAsync('database-query', async () => {
    return await db.query(sql);
}, {
    table: tableName,
    queryType: 'SELECT',
    resultCount: results.length
});
```

### 3. Set Appropriate Thresholds

- **Fast operations** (< 100ms): Set threshold to 50-100ms
- **Medium operations** (100-1000ms): Set threshold to 500-1000ms
- **Slow operations** (> 1000ms): Set threshold to 1000-5000ms

### 4. Monitor Key Operations

Focus monitoring on:
- External API calls (AI providers, MCP servers)
- Database queries
- File I/O operations
- Cache operations
- Long-running computations

### 5. Regular Review

- Check performance reports weekly or after significant changes
- Identify operations with:
  - High failure rates (< 95% success)
  - Increasing average duration
  - High P95/P99 times (indicates variability)
  - Frequent slow operation warnings

### 6. Use Persistence Wisely

- Enable persistence for production environments
- Disable for development if you want fresh stats each session
- Regularly export and archive historical data

## Integration Examples

### In AI Workflows

```typescript
import { measureAsync } from './utils/performanceMonitorInstance';

async function generateCode(prompt: string): Promise<string> {
    return measureAsync('ai-generate-code', async () => {
        const response = await aiProvider.generate(prompt);
        return response.code;
    }, {
        promptLength: prompt.length,
        model: aiProvider.modelName
    });
}
```

### In Cache Operations

```typescript
import { measure } from './utils/performanceMonitorInstance';

class Cache {
    get(key: string): any {
        return measure('cache-get', () => {
            return this.storage.get(key);
        }, { cacheType: 'semantic' });
    }
    
    async set(key: string, value: any): Promise<void> {
        return measureAsync('cache-set', async () => {
            await this.storage.set(key, value);
        }, { cacheType: 'semantic', valueSize: JSON.stringify(value).length });
    }
}
```

### In MCP Operations

```typescript
import { measureAsync } from './utils/performanceMonitorInstance';

async function queryMcpServer(query: string): Promise<Result> {
    return measureAsync('mcp-query', async () => {
        return await mcpClient.query(query);
    }, {
        queryType: 'examples',
        queryLength: query.length
    });
}
```

## Performance Optimization Tips

### Based on Monitor Data

1. **High P99 times**: Investigate edge cases or implement timeout protection
2. **Increasing average duration**: Check for memory leaks or resource exhaustion
3. **Low success rate**: Improve error handling and retry logic
4. **Frequent slow operations**: Consider caching, pagination, or async processing

### Monitoring Overhead

The Performance Monitor itself has minimal overhead:
- ~0.1ms per measurement start/end
- ~1KB memory per measurement (with metadata)
- Async persistence doesn't block operations

To minimize overhead:
- Set `detailedLogging: false` in production
- Use reasonable `maxMeasurements` limits (100-1000)
- Don't measure very small operations (< 1ms)

## Troubleshooting

### No data in reports

- Check `axonMcp.performance.enabled` is `true`
- Verify operations are being called
- Check if persistence is disabled and extension was recently restarted

### Stats seem inaccurate

- Clear statistics and collect fresh data
- Check for clock skew issues (system time changes)
- Verify `maxMeasurements` isn't too low (causing LRU eviction)

### Performance degradation

- Reduce `maxMeasurements` limit
- Disable `detailedLogging`
- Increase `slowOperationThreshold` to reduce logging
- Disable persistence if not needed

## Architecture

### Data Flow

```
Operation Start → PerformanceMonitor.startMeasurement()
    ↓
[Operation Executes]
    ↓
Operation End → PerformanceMonitor.endMeasurement()
    ↓
Store Measurement → measurements Map
    ↓
(if slowOperationThreshold exceeded) → Log to Output Channel
    ↓
(if persistStats enabled) → Save to GlobalState
```

### Storage

- **In-Memory**: Active measurements Map
- **Persisted**: VSCode GlobalState (survives restarts)
- **Exported**: JSON files (for long-term analysis)

### Thread Safety

The Performance Monitor is designed for single-threaded environments (VSCode extension host). Concurrent measurements of the same operation type are supported and tracked independently.

## API Reference

### PerformanceMonitor Class

#### Methods

- `startMeasurement(operation: string, metadata?: Record<string, any>): string`
  - Start timing an operation
  - Returns measurement ID

- `endMeasurement(measurementId: string, success: boolean, error?: string): void`
  - End timing and record results

- `measureAsync<T>(operation: string, fn: () => Promise<T>, metadata?): Promise<T>`
  - Measure async operation with automatic error handling

- `measure<T>(operation: string, fn: () => T, metadata?): T`
  - Measure sync operation with automatic error handling

- `getOperationStats(operation: string): OperationStats | null`
  - Get statistics for specific operation

- `getAllStats(): OperationStats[]`
  - Get statistics for all operations (sorted by avg duration)

- `getReport(): string`
  - Generate formatted text report

- `exportStats(): string`
  - Export all data as JSON string

- `getSlowOperations(limit?: number): PerformanceMeasurement[]`
  - Get recent slow operations

- `getRecentFailures(limit?: number): PerformanceMeasurement[]`
  - Get recent failed operations

- `clearOperation(operation: string): void`
  - Clear data for specific operation

- `clearAll(): void`
  - Clear all performance data

### Helper Functions

- `setPerformanceMonitor(monitor: PerformanceMonitor): void`
  - Set global instance (called during extension activation)

- `getPerformanceMonitor(): PerformanceMonitor | null`
  - Get global instance

- `measureAsync<T>(operation: string, fn: () => Promise<T>, metadata?): Promise<T>`
  - Global async measurement helper

- `measure<T>(operation: string, fn: () => T, metadata?): T`
  - Global sync measurement helper

## Future Enhancements

Potential improvements for future versions:

1. **Visual Dashboard**: WebView-based performance dashboard
2. **Alerting**: Configurable alerts for performance thresholds
3. **Trends**: Historical trend analysis and visualization
4. **Comparison**: Compare performance across different time periods
5. **Profiling**: Integration with Chrome DevTools profiler
6. **Distribution Charts**: Visualize duration distributions
7. **Correlation**: Analyze performance vs. other metrics (memory, CPU)
8. **Sampling**: Configurable sampling rate to reduce overhead

## See Also

- [Cache Configuration Guide](./CACHE_CONFIGURATION.md)
- [Testing Documentation](./TESTING.md)
- [Architecture Overview](./ARCHITECTURE.md)
