# Sample Axon MCP Server Initialization Output

## When Loading from Cache:

```
╔══════════════════════════════════════════════════════════════╗
║           Axon MCP Server Initialization                     ║
╚══════════════════════════════════════════════════════════════╝

📦 Loading from cache...

┌────────────────────────────────────────────────────────────┐
│ Axon Code Index Summary                                      │
├─────────────────────────────┬──────────────────────────────┤
│ Feature                     │ Count                        │
├─────────────────────────────┼──────────────────────────────┤
│ Total Functions             │ 1961                         │
│ Categories                  │ 11                           │
│ Unique Tags                 │ 847                          │
├─────────────────────────────┼──────────────────────────────┤
│ Top Categories:             │                              │
│   - Uncategorized           │ 845                          │
│   - Utilities               │ 298                          │
│   - Data_analysis           │ 186                          │
│   - Admin                   │ 173                          │
│   - Energy                  │ 152                          │
└─────────────────────────────┴──────────────────────────────┘

Building search index...

┌────────────────────────────────────────────────────────────┐
│ Search Index Summary                                         │
├─────────────────────────────┬──────────────────────────────┤
│ Unique Search Tokens        │ 14261                        │
│ Avg Functions per Token     │ 2.47                         │
└─────────────────────────────┴──────────────────────────────┘

Building function usage index...

┌────────────────────────────────────────────────────────────┐
│ Function Usage Index Summary                                 │
├─────────────────────────────┬──────────────────────────────┤
│ Total Function Calls Found  │ 48213                        │
│ Unique Functions Called     │ 523                          │
│ Built-in Functions          │ 85                           │
│ User-defined Functions      │ 438                          │
│ Unused Functions            │ 1438                         │
├─────────────────────────────┼──────────────────────────────┤
│ Most Used Functions:        │                              │
│   1. readAll                │ 287 calls                    │
│   2. read                   │ 245 calls                    │
│   3. commit                 │ 189 calls                    │
│   4. hisRead                │ 156 calls                    │
│   5. each                   │ 142 calls                    │
└─────────────────────────────┴──────────────────────────────┘

╔══════════════════════════════════════════════════════════════╗
║ ✓ Axon MCP Server Ready                                       ║
╚══════════════════════════════════════════════════════════════╝
```

## Benefits of the New Display:

### 1. **Code Index Summary Table**
- Shows total functions, categories, and tags at a glance
- Lists top 5 categories with counts
- Easy to see what content is available

### 2. **Search Index Summary Table**
- Shows search capability metrics
- Token count indicates search comprehensiveness
- Average functions per token shows index efficiency

### 3. **Function Usage Index Summary Table**
- Total function calls found in the codebase
- Breakdown of built-in vs user-defined functions
- **Unused functions count** - helps identify dead code
- **Top 5 most used functions** - shows common patterns

### 4. **Visual Organization**
- Clear section headers with borders
- Tabular format for easy scanning
- Emoji indicators (📦) for visual cues
- Progress indicators show what's happening

### 5. **Performance Insights**
From the timing messages, you can see:
- Cache load time
- Search index build time (30ms)
- Function usage index build time
- Overall startup performance

This enhanced output makes it much easier to understand:
- What data is available
- How comprehensive the indexing is
- Which functions are most important
- Where optimization opportunities exist (unused functions)