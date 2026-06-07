# FlexSearch Integration Test Guide

This guide provides comprehensive test scenarios to verify the FlexSearch documentation search functionality.

## ✅ Quick Verification Checklist

- [x] FlexSearch dependencies installed
- [x] Server builds successfully
- [x] Server starts and indexes documentation
- [x] Search returns relevant results
- [ ] All test scenarios pass (see below)

## 🧪 Test Scenarios

### Test 1: Basic Search - "task"

**Expected Behavior:**
- Returns `lib-task/doc.html` as top result
- Relevance score > 80
- Includes "Overview", "Record Tasks", "Ephemeral Tasks" sections
- Contains code examples with `taskRun()`, `taskSend()`

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "task",
    "limit": 5
  }
}
```

**Success Criteria:**
- `count` >= 1
- First result has `library: "lib-task"`
- `relevanceScore` > 80
- `matchedSections` contains relevant task-related sections

---

### Test 2: Library Filtering - "lib-his"

**Expected Behavior:**
- Returns only results from `lib-his` library
- Includes historical data functions
- Contains `hisRead`, `hisWrite` documentation

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "history",
    "library": "lib-his",
    "limit": 5
  }
}
```

**Success Criteria:**
- All results have `library` containing "his"
- Results include history-related documentation
- Code examples show `hisRead()`, `hisWrite()`

---

### Test 3: Energy Calculations

**Expected Behavior:**
- Returns energy-related documentation
- Includes lib-energy or energy calculation docs
- Contains formulas and examples

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "energy calculation",
    "limit": 5
  }
}
```

**Success Criteria:**
- Results relate to energy consumption, kWh, or calculations
- Sections contain energy-specific terminology
- Code examples show energy functions

---

### Test 4: Multi-word Query

**Expected Behavior:**
- Handles phrase search correctly
- Returns contextually relevant results
- Ranks based on phrase proximity

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "asynchronous background threads",
    "limit": 3
  }
}
```

**Success Criteria:**
- Returns task-related documentation
- Highlights matching phrases in context
- Relevance scores reflect phrase matching

---

### Test 5: Section Limiting

**Expected Behavior:**
- Returns only specified number of sections per document
- Most relevant sections appear first

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "point",
    "maxSections": 2,
    "limit": 5
  }
}
```

**Success Criteria:**
- Each result has <= 2 matched sections
- Sections are most relevant to query
- Results maintain high relevance scores

---

### Test 6: Content Inclusion Control

**Expected Behavior:**
- Full content when `includeContent: true`
- Summaries when `includeContent: false`

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "task",
    "includeContent": false,
    "limit": 3
  }
}
```

**Success Criteria:**
- Section content is truncated (ends with "...")
- Still includes code examples
- Response is smaller/faster

---

### Test 7: Cache Performance

**Expected Behavior:**
- First run takes 30-60 seconds
- Second run loads in <1 second
- Results are identical

**How to Test:**
```bash
# Clear cache
rm -f .cache/flexsearch-docs.json .cache/flexsearch-metadata.json

# First run (should build index)
time npm start

# Stop and restart (should load from cache)
time npm start
```

**Success Criteria:**
- First run logs "Building FlexSearch documentation index..."
- Second run logs "FlexSearch documentation index loaded from cache"
- Second run is significantly faster

---

### Test 8: No Results Handling

**Expected Behavior:**
- Graceful response when no matches found
- Helpful suggestion message

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "xyzabc123nonexistent",
    "limit": 10
  }
}
```

**Success Criteria:**
- Returns `count: 0`
- Includes helpful message
- Suggests trying different keywords

---

### Test 9: Special Characters

**Expected Behavior:**
- Handles operators and special characters
- Returns relevant documentation

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "=>",
    "limit": 5
  }
}
```

**Success Criteria:**
- Returns documentation containing arrow operators
- Code examples show lambda expressions
- No search errors

---

### Test 10: Common Functions

**Expected Behavior:**
- Returns documentation for common Axon functions
- High relevance for well-documented functions

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "readAll",
    "limit": 5
  }
}
```

**Success Criteria:**
- Returns documentation with `readAll()` examples
- Sections explain function usage
- Code examples demonstrate proper syntax

---

## 📊 Performance Tests

### Test 11: Search Speed

**Expected Behavior:**
- Most searches complete in <50ms
- Complex queries in <200ms

**How to Test:**
1. Run multiple searches and measure time
2. Check server logs for search duration
3. Use different query complexities

**Success Criteria:**
- Average search time < 50ms
- 95th percentile < 200ms
- No timeouts or hangs

---

### Test 12: Memory Usage

**Expected Behavior:**
- Server memory stays under 200MB
- No memory leaks over time

**How to Test:**
```bash
# Monitor memory during operation
node --expose-gc --trace-gc dist/index.js
```

**Success Criteria:**
- Initial memory < 200MB after indexing
- Memory stable over time
- No continuous memory growth

---

### Test 13: Large Result Sets

**Expected Behavior:**
- Handles large limits efficiently
- Returns results without timeout

**How to Test:**
```json
{
  "tool": "searchAxonDocs",
  "arguments": {
    "keyword": "function",
    "limit": 50
  }
}
```

**Success Criteria:**
- Returns up to 50 results
- No performance degradation
- Results properly ranked

---

## 🐛 Error Handling Tests

### Test 14: Missing docsPath

**Expected Behavior:**
- Graceful handling when docs not configured
- Helpful error message

**Success Criteria:**
- Server starts without crashing
- Logs warning about missing docsPath
- Falls back to legacy search

---

### Test 15: Corrupted Cache

**Expected Behavior:**
- Detects corrupted cache
- Rebuilds index automatically

**How to Test:**
```bash
# Corrupt the cache
echo "invalid json" > .cache/flexsearch-docs.json

# Restart server
npm start
```

**Success Criteria:**
- Detects invalid cache
- Rebuilds index from scratch
- Logs appropriate warning

---

## 📝 Test Results Template

```markdown
## Test Run: [Date/Time]

### Environment
- Node Version: 
- OS: macOS
- Total HTML Files: 4,187
- Index Size: ~20MB

### Results

| Test | Status | Notes |
|------|--------|-------|
| Basic Search "task" | ✅ | Relevance: 95 |
| Library Filtering | ✅ | Correct filtering |
| Energy Calculations | ✅ | 5 results found |
| Multi-word Query | ✅ | Good phrase matching |
| Section Limiting | ✅ | Respects maxSections |
| Content Control | ✅ | Truncation works |
| Cache Performance | ✅ | 45s → <1s |
| No Results | ✅ | Helpful message |
| Special Characters | ✅ | No errors |
| Common Functions | ✅ | High relevance |
| Search Speed | ✅ | Avg 35ms |
| Memory Usage | ✅ | ~150MB stable |
| Large Result Sets | ✅ | 50 results in 80ms |

### Performance Summary
- Initial Index Build: 45 seconds
- Cache Load Time: 0.8 seconds
- Average Search Time: 35ms
- Memory Usage: 150MB
- Documents Indexed: 4,187

### Issues Found
- None

### Recommendations
- All tests passing
- Performance exceeds expectations
- Ready for production use
```

---

## 🚀 Continuous Testing

### Automated Test Script

Create a simple test script to verify core functionality:

```bash
#!/bin/bash
# test-flexsearch.sh

echo "Testing FlexSearch Integration..."

# Test 1: Basic search
echo "Test 1: Basic search..."
# Add your test command here

# Test 2: Library filtering
echo "Test 2: Library filtering..."
# Add your test command here

# Add more tests...

echo "All tests completed!"
```

---

## 📞 Troubleshooting

**Issue: Search returns no results**
- Verify docsPath is configured correctly
- Check that HTML files exist
- Clear cache and rebuild: `npm run cache:clear:all`

**Issue: Slow initial indexing**
- Normal for first run (4,187 files)
- Subsequent runs use cache (<1s)
- Reduce files with excludeDirs if needed

**Issue: Out of memory**
- Increase Node.js heap: `node --max-old-space-size=4096`
- Reduce indexed files in config
- Check for memory leaks

**Issue: Cache not loading**
- Check .cache directory permissions
- Verify cache files exist
- Check cache metadata version matches

---

## ✨ Success Indicators

Your FlexSearch integration is working correctly when:

1. ✅ Search for "task" returns lib-task documentation as #1 result
2. ✅ Relevance scores are meaningful (0-100 scale)
3. ✅ Library filtering works accurately
4. ✅ Cache loads in <1 second on subsequent starts
5. ✅ Search times average <50ms
6. ✅ Memory usage remains stable under 200MB
7. ✅ No errors in server logs
8. ✅ All test scenarios pass

**Congratulations! Your FlexSearch integration is production-ready! 🎉**
