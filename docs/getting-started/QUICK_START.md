# Quick Start Guide

## 📍 You Are Here
- **Project:** Axon Template Library for MCP Server
- **Status:** 97% complete (33 templates created, validation done, fixes pending)
- **Location:** `/Users/<user>/Code/axon-mcp-server`

## 🎯 What You Need to Do
Fix **41 errors** in template files (3-7 hours estimated)

## ⚡ Quick Commands

```bash
# Navigate to project
cd /Users/<user>/Code/axon-mcp-server

# Run validation (shows all errors/warnings)
node scripts/validate-templates.js

# Count templates
find templates -name "*.yaml" | wc -l  # Should show 33
```

## 🔴 Top Priority Fixes

### 1. Quick Wins (30 min) - Fix These First!
Fix invalid parameter types in 6 pre-existing templates:

```bash
# Files to edit:
templates/data/equipment-query.yaml
templates/data/point-history.yaml
templates/energy/meter-consumption.yaml
templates/fault/temperature-fault.yaml
templates/hvac/ahu-status.yaml

# Replace in each file:
type: filter  →  type: string
type: str     →  type: string
type: num     →  type: number
```

### 2. Main Work (2-4 hours) - Then Do These
Fix unbalanced `do/end` blocks in 24 newly created templates.

**Strategy:** Pick templates with small imbalances first
- Look for templates off by 1-3 blocks
- Open file, find `template:` section
- Count/balance `do` and `end` keywords
- Validate after each fix

## 📚 Full Documentation

- **HANDOFF.md** - Complete guide (read this for full context)
- **TEMPLATES_SUMMARY.md** - Overview of all templates  
- **VALIDATION_REPORT.md** - Current validation results

## 🆘 If Stuck

1. Re-read HANDOFF.md sections on fixing do/end blocks
2. Start with one category (energy, HVAC, fault, or data)
3. Use validation feedback to guide you
4. Remember: It's tedious but straightforward!

---

**Start here:** Open HANDOFF.md and read from top to bottom  
**Then:** Run `node scripts/validate-templates.js` to see current state