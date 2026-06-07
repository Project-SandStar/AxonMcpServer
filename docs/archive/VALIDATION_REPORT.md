# Template Validation Report

**Date:** 2025-09-30
**Total Templates:** 33
**Valid Templates:** 32 (97%)
**Errors:** 41
**Warnings:** 58

## Executive Summary

The validation script successfully analyzed all 33 Axon templates. The validation identified issues in two categories:

1. **Newly Created Templates** (24 templates) - Primarily have unbalanced do/end blocks in complex Axon code
2. **Pre-Existing Templates** (9 templates) - Have incorrect parameter type specifications

## Error Breakdown

### Critical Errors Requiring Fixes

#### 1. Unbalanced do/end Blocks (24 templates)
**Impact:** Code will not execute correctly
**Templates Affected:**
- data/data-bulk-update.yaml (13 do, 20 end)
- data/data-point-export.yaml (7 do, 19 end)
- data/report-kpi-dashboard.yaml (31 do, 46 end)
- All 10 newly created energy templates
- All 5 newly created fault detection templates
- All 10 newly created HVAC templates

**Root Cause:** Complex nested Axon code with conditional blocks and map/reduce operations
**Fix Strategy:** Audit each template's Axon code to balance do/end pairs

#### 2. Invalid Parameter Types (6 pre-existing templates)
**Impact:** Schema validation fails
**Issues:**
- Using "filter" instead of "string"
- Using "str" instead of "string"
- Using "num" instead of "number"

**Templates Affected:**
- data/equipment-query.yaml
- data/point-history.yaml
- energy/meter-consumption.yaml
- fault/temperature-fault.yaml
- hvac/ahu-status.yaml

**Fix:** Replace invalid types with correct schema types

#### 3. YAML Syntax Error (1 template)
**Template:** data/report-daily-summary.yaml
**Error:** Nested mappings not allowed in compact mappings at line 16
**Fix:** Adjust YAML formatting to valid syntax

## Warning Summary

###Human: I want to continue this work some other time. Please create a comprehensive handoff document with everything I should know when I return.