# Performance Monitor - Quick Start Guide

## Installation

The Performance Monitor is automatically initialized when the extension activates. No additional setup required.

## Basic Usage

### Measure an Async Operation

```typescript
import { measureAsync } from './utils/performanceMonitorInstance';

const result = await measureAsync('my-operation', async () => {
    return await doSomething();
});
```

### Measure a Sync Operation

```typescript
import { measure } from './utils/performanceMonitorInstance';

const value = measure('calculation', () => {
    return calculate();
});
```

### With Metadata

```typescript
await measureAsync('ai-generate', async () => {
    return await provider.generate(prompt);
}, {
    model: 'claude',
    promptLength: prompt.length,
    temperature: 0.7
});
```

## View Performance Data

### Via Command Palette

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Axon: View Performance Report"
3. View comprehensive statistics

### Programmatically

```typescript
import { getPerformanceMonitor } from './utils/performanceMonitorInstance';

const monitor = getPerformanceMonitor();

// Get specific operation stats
const stats = monitor.getOperationStats('my-operation');
console.log(`Average: ${stats.avgDuration}ms`);
console.log(`P95: ${stats.p95}ms`);
console.log(`Success Rate: ${stats.successRate}%`);

// Get all stats
const allStats = monitor.getAllStats();

// Get slow operations
const slowOps = monitor.getSlowOperations(10);

// Get recent failures
const failures = monitor.getRecentFailures(10);
```

## Configuration

Add to your `settings.json`:

```json
{
    "axonMcp.performance.enabled": true,
    "axonMcp.performance.slowOperationThreshold": 1000,
    "axonMcp.performance.logSlowOperations": true,
    "axonMcp.performance.detailedLogging": false
}
```

## Common Patterns

### Measuring API Calls

```typescript
await measureAsync('anthropic-api', async () => {
    return await anthropic.messages.create({...});
}, { model: 'claude-4.5', tokens: estimatedTokens });
```

### Measuring Cache Operations

```typescript
const value = measure('cache-get', () => {
    return cache.get(key);
}, { cacheType: 'semantic' });
```

### Measuring Database Queries

```typescript
await measureAsync('db-query', async () => {
    return await db.query(sql);
}, { table: 'users', operation: 'SELECT' });
```

### Manual Control (Advanced)

```typescript
const monitor = getPerformanceMonitor();
const id = monitor.startMeasurement('custom-op', { context: 'value' });

try {
    // Your operation
    monitor.endMeasurement(id, true);
} catch (error) {
    monitor.endMeasurement(id, false, error.message);
    throw error;
}
```

## Understanding Statistics

### Duration Metrics
- **Average**: Typical duration
- **P50**: Median (50% are faster)
- **P95**: 95% are faster (good for SLAs)
- **P99**: 99% are faster (extreme cases)

### Example Report

```
Operation: ai-generate-code
  Count:        50
  Success Rate: 98.00% (49/50)
  Duration (ms):
    Average:    1250.45
    Min:        890.23
    Max:        3450.67
    P50:        1180.34
    P95:        2100.45
    P99:        2800.12
```

**Interpretation**: 
- Most requests take ~1.2 seconds (P50)
- 95% complete under 2.1 seconds (P95)
- Occasional outliers up to 3.5 seconds (Max)

## Exporting Data

### Via Command Palette

1. `Cmd+Shift+P` → "Axon: Export Performance Statistics"
2. Choose save location
3. JSON file contains all stats

### Programmatically

```typescript
const json = monitor.exportStats();
await fs.writeFile('performance-stats.json', json);
```

## Tips

### Do Measure
✅ External API calls  
✅ Database queries  
✅ File I/O operations  
✅ Long computations  
✅ Cache operations  

### Don't Measure
❌ Very fast operations (< 1ms)  
❌ Operations called thousands of times per second  
❌ Inside tight loops  

### Best Practices
- Use descriptive operation names
- Include relevant metadata
- Review reports regularly
- Focus on P95/P99 for optimization
- Set appropriate thresholds for your use case

## Troubleshooting

### No Data Available
- Check `axonMcp.performance.enabled` is `true`
- Verify operations are being called
- Check Output Channel → "Axon Performance"

### Stats Seem Off
- Clear stats: `Cmd+Shift+P` → "Axon: Clear Performance Statistics"
- Collect fresh data
- Check for system time changes

### Performance Degradation
- Reduce `maxMeasurements` setting
- Disable `detailedLogging`
- Increase `slowOperationThreshold`

## Further Reading

- [Complete Documentation](./PERFORMANCE_MONITOR.md)
- [Implementation Details](./PERFORMANCE_MONITOR_IMPLEMENTATION.md)
- [Cache Configuration](./CACHE_CONFIGURATION.md)

## Quick Commands

| Command | Description |
|---------|-------------|
| `Axon: View Performance Report` | Show comprehensive report |
| `Axon: Clear Performance Statistics` | Clear all data |
| `Axon: Export Performance Statistics` | Export to JSON |

## Example Integration

```typescript
// In your service class
class CodeGenerator {
    async generate(prompt: string): Promise<string> {
        return measureAsync('code-generation', async () => {
            const context = await this.gatherContext();
            const response = await this.callAI(prompt, context);
            return response.code;
        }, {
            promptLength: prompt.length,
            hasContext: !!context
        });
    }
}
```

---

**That's it!** You're now ready to use the Performance Monitor to track and optimize your extension's performance.
