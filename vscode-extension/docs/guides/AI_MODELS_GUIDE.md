# AI Models Configuration Guide

## Overview

The Axon extension uses a **two-phase approach** for AI code generation:
1. **Planning Phase** - Uses a lighter, faster model to understand requirements
2. **Code Generation Phase** - Uses a more capable model to write actual code

You can now select different models for each phase and control the thinking budget!

## Accessing Model Settings

### Via Settings UI
1. Open Settings: `⌘+,` (macOS) or `Ctrl+,` (Windows/Linux)
2. Search for: `axon.ai`
3. You'll see three settings:
   - **Plan Model** - Dropdown with all available models
   - **Act Model** - Dropdown with all available models  
   - **Thinking Budget** - Slider from 1,000 to 100,000 tokens

### Via Settings JSON
```json
{
  "axon.ai.planModel": "claude-3-5-haiku-20241022",
  "axon.ai.actModel": "claude-sonnet-4-20250514",
  "axon.ai.thinkingBudget": 10000
}
```

## Available Models

### Claude 4 Series (Latest & Most Capable)

#### Claude 4 Sonnet
- **ID:** `claude-sonnet-4-20250514`
- **Best For:** Complex code generation, advanced reasoning
- **Speed:** Fast
- **Quality:** Highest
- **Cost:** Moderate
- **Recommended Use:** Act model for production code

### Claude 3.5 Series (Balanced)

#### Claude 3.5 Sonnet (October 2024)
- **ID:** `claude-3-5-sonnet-20241022`
- **Best For:** General code generation, good balance
- **Speed:** Very Fast
- **Quality:** Excellent
- **Cost:** Moderate
- **Recommended Use:** Both plan and act phases

#### Claude 3.5 Sonnet (June 2024)
- **ID:** `claude-3-5-sonnet-20240620`
- **Best For:** Legacy/compatibility
- **Speed:** Very Fast
- **Quality:** Excellent
- **Cost:** Moderate

#### Claude 3.5 Haiku (October 2024) ⚡
- **ID:** `claude-3-5-haiku-20241022`
- **Best For:** Planning, fast iterations, simple code
- **Speed:** Fastest
- **Quality:** Very Good
- **Cost:** Low
- **Recommended Use:** Plan model (default)

### Claude 3 Series (Original)

#### Claude 3 Opus
- **ID:** `claude-3-opus-20240229`
- **Best For:** Most complex reasoning tasks
- **Speed:** Slower
- **Quality:** Highest (v3)
- **Cost:** High
- **Recommended Use:** Very complex code only

#### Claude 3 Haiku
- **ID:** `claude-3-haiku-20240307`
- **Best For:** Basic code, planning
- **Speed:** Very Fast
- **Quality:** Good
- **Cost:** Low

## Recommended Configurations

### 1. Best Quality (Recommended for Production)
```json
{
  "axon.ai.planModel": "claude-3-5-haiku-20241022",
  "axon.ai.actModel": "claude-sonnet-4-20250514",
  "axon.ai.thinkingBudget": 10000
}
```
**Why:** Fast planning with Haiku, best code with Claude 4 Sonnet

### 2. Balanced Performance
```json
{
  "axon.ai.planModel": "claude-3-5-haiku-20241022",
  "axon.ai.actModel": "claude-3-5-sonnet-20241022",
  "axon.ai.thinkingBudget": 10000
}
```
**Why:** Great balance of speed and quality, lower cost than Claude 4

### 3. Maximum Speed
```json
{
  "axon.ai.planModel": "claude-3-5-haiku-20241022",
  "axon.ai.actModel": "claude-3-5-haiku-20241022",
  "axon.ai.thinkingBudget": 5000
}
```
**Why:** Fastest responses, good for simple code and prototyping

### 4. Maximum Quality (Expensive)
```json
{
  "axon.ai.planModel": "claude-3-5-sonnet-20241022",
  "axon.ai.actModel": "claude-3-opus-20240229",
  "axon.ai.thinkingBudget": 20000
}
```
**Why:** Best possible results for very complex code

## Thinking Budget

### What Is It?
The **thinking budget** controls how many tokens the AI can use for **extended thinking** before generating code. This is like giving the AI more "thinking time" to reason through complex problems.

### How It Works
- **Low (1,000 - 5,000):** Quick responses, less deep reasoning
- **Medium (5,000 - 15,000):** Balanced, good for most tasks
- **High (15,000 - 100,000):** Deep reasoning, best for complex problems

### When to Increase
- Complex business logic
- Performance-critical code
- Multi-file refactoring
- Advanced algorithms
- Security-sensitive code

### When to Decrease
- Simple functions
- Quick prototypes
- Well-defined tasks
- Cost-sensitive projects

### Cost Impact
Higher thinking budgets use more tokens = higher API costs. Most tasks work well with 10,000 tokens.

## Model Selection Guide

### For Planning Phase

**Best Choice: Claude 3.5 Haiku** (default)
- Fast understanding of requirements
- Cost-effective
- Accurate planning

**Alternative: Claude 3.5 Sonnet**
- More detailed planning
- Better for complex requirements
- Slightly higher cost

### For Code Generation Phase

**Best Choice: Claude 4 Sonnet** (default)
- Latest model, best code quality
- Excellent at Axon/SkySpark
- Fast and efficient

**Alternative: Claude 3.5 Sonnet**
- Slightly less capable but still excellent
- Lower cost than Claude 4
- Great for most projects

**Budget Choice: Claude 3.5 Haiku**
- Fast code generation
- Good for simple functions
- Most cost-effective

## Performance Comparison

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| Claude 4 Sonnet | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰💰 | Production code |
| Claude 3.5 Sonnet (Oct) | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 💰💰 | Balanced |
| Claude 3.5 Haiku | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | 💰 | Planning |
| Claude 3 Opus | ⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰💰💰 | Complex tasks |
| Claude 3 Haiku | ⚡⚡⚡⚡ | ⭐⭐ | 💰 | Simple code |

## Cost Optimization Tips

### 1. Use Haiku for Planning
```json
"axon.ai.planModel": "claude-3-5-haiku-20241022"
```
Saves ~70% on planning costs with minimal quality impact

### 2. Adjust Thinking Budget
```json
"axon.ai.thinkingBudget": 5000
```
Use lower budgets for simple tasks

### 3. Use Appropriate Act Model
- Simple code → Haiku
- Standard code → 3.5 Sonnet
- Complex code → 4 Sonnet or Opus

### 4. Monitor Usage
Check your API usage at:
https://console.anthropic.com/settings/usage

## Model Update Schedule

Anthropic releases new models regularly. Check for updates:
- Latest models list: https://docs.anthropic.com/models
- Extension updates will add new models automatically

## Troubleshooting

### Model Not Available
**Problem:** Selected model returns error

**Solution:**
1. Check your Anthropic API tier
2. Verify model ID is correct
3. Try a different model from the dropdown

### Slow Responses
**Problem:** Code generation takes too long

**Solution:**
1. Use faster models (Haiku or 3.5 Sonnet)
2. Reduce thinking budget
3. Break complex tasks into smaller pieces

### Poor Code Quality
**Problem:** Generated code has issues

**Solution:**
1. Switch to more capable model (4 Sonnet or Opus)
2. Increase thinking budget
3. Provide more context in your prompts

### High Costs
**Problem:** API costs are too high

**Solution:**
1. Use Haiku for both phases
2. Reduce thinking budget to 5,000
3. Be more specific in prompts to reduce retries

## Example Workflows

### Workflow 1: Simple Function
```
Task: "Create a function to calculate average"
Settings: 
  - Plan: Haiku
  - Act: Haiku  
  - Budget: 5000
Time: ~5 seconds
Cost: Low
```

### Workflow 2: Complex Business Logic
```
Task: "Implement energy usage optimization algorithm"
Settings:
  - Plan: 3.5 Sonnet
  - Act: 4 Sonnet
  - Budget: 15000
Time: ~15 seconds
Cost: Medium
```

### Workflow 3: Production System
```
Task: "Build complete HVAC control system"
Settings:
  - Plan: 3.5 Sonnet
  - Act: Opus
  - Budget: 25000
Time: ~30 seconds
Cost: High
```

## Integration with Chat

The model settings also apply to the AI Chat panel:
- Plan model: Used for understanding questions
- Act model: Used for generating answers and code
- Thinking budget: Applied to complex reasoning

## Future Enhancements

Coming soon:
- [ ] Per-command model selection
- [ ] Automatic model selection based on task complexity
- [ ] Cost tracking and budgets
- [ ] Model performance analytics
- [ ] Custom model presets

## Related Documentation

- [API Key Setup](./API_KEY_SETUP.md) - Configure your API key
- [Quick Reference](./QUICK_REFERENCE.md) - All commands
- [Sidebar Guide](./SIDEBAR_GUIDE.md) - Using the sidebar

## Support

For model-specific questions:
- Anthropic Docs: https://docs.anthropic.com/
- Model Comparison: https://docs.anthropic.com/models

---

**Happy Coding with AI!** 🤖✨
