# DefComp Template Management Workflow

## Overview

This document describes how the VSCode extension handles defcomp (defined component) template matching and application, with a forward-looking path to XETO specs implementation.

---

## Use Case: DefComp Template Application

**User Request:**
> "We have a bunch of defcomp spark templates. Check the server's schema, if it matches, apply them. Handle defcomps first, then we can improve with XETO later."

**Goal:**
- Store library of defcomp templates (Spark templates)
- Analyze SkySpark project schema
- Match templates to existing records
- Apply templates intelligently
- Version 2: Upgrade to XETO specs

---

## Architecture: Version 1 (DefComp Focus)

### Component Stack

```
┌─────────────────────────────────────────────────┐
│         DefComp Template Manager                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Template Library                          │  │
│  │  - defcomp definitions                     │  │
│  │  - Spark templates                         │  │
│  │  - Template metadata                       │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Schema Matcher                            │  │
│  │  - Query project schema                    │  │
│  │  - Match templates to records              │  │
│  │  - Validate compatibility                  │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Template Applier                          │  │
│  │  - Generate application code               │  │
│  │  - Batch apply templates                   │  │
│  │  - Track changes                           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│          MCP Server                              │
│  - Query project schema                          │
│  - Analyze record structure                      │
│  - Validate template compatibility               │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│       SkySpark REST API                          │
│  - Read records                                  │
│  - Apply defcomp templates                       │
│  - Execute generated code                        │
└─────────────────────────────────────────────────┘
```

---

## Phase 1: Template Library Management

### 1.1 DefComp Template Structure

```typescript
// src/templates/DefCompTemplate.ts
export interface DefCompTemplate {
  id: string;
  name: string;
  description: string;
  
  // Template definition (Spark format)
  defcompCode: string;
  
  // Matching criteria
  matcher: {
    requiredTags: string[];         // Must have these tags
    optionalTags?: string[];        // Nice to have
    markerTag: string;              // Primary marker (e.g., 'ahu', 'vav')
    excludeTags?: string[];         // Must NOT have these
    customFilter?: string;          // Additional Axon filter
  };
  
  // Template metadata
  metadata: {
    version: string;
    author: string;
    category: string;               // 'hvac', 'lighting', 'energy', etc.
    tags: string[];
    compatible: string[];           // Compatible SkySpark versions
  };
  
  // Application behavior
  options: {
    overwriteExisting: boolean;     // Replace existing templates
    validateBeforeApply: boolean;   // Check for conflicts
    dryRunFirst: boolean;           // Test before applying
    batchSize: number;              // Apply in batches
  };
}
```

### 1.2 Example DefComp Templates

```typescript
// AHU Spark Template
const ahuTemplate: DefCompTemplate = {
  id: 'ahu-standard-v1',
  name: 'Standard AHU Template',
  description: 'Standard AHU defcomp with supply/return/mixed air points',
  
  defcompCode: `
defcomp ^ahu
  mandatory ^discharge ^air ^temp ^sensor ^point
  mandatory ^return ^air ^temp ^sensor ^point
  optional ^mixed ^air ^temp ^sensor ^point
  optional ^discharge ^air ^flow ^sensor ^point
  optional ^discharge ^air ^damper ^cmd ^point
  optional ^return ^air ^damper ^cmd ^point
  optional ^economizer ^cmd ^point
  optional ^cooling ^valve ^cmd ^point
  optional ^heating ^valve ^cmd ^point
end
  `,
  
  matcher: {
    requiredTags: ['equip', 'ahu'],
    markerTag: 'ahu',
    excludeTags: ['obsolete', 'template']
  },
  
  metadata: {
    version: '1.0.0',
    author: 'HVAC Team',
    category: 'hvac',
    tags: ['ahu', 'air-handling'],
    compatible: ['3.0.x', '3.1.x']
  },
  
  options: {
    overwriteExisting: false,
    validateBeforeApply: true,
    dryRunFirst: true,
    batchSize: 10
  }
};

// VAV Spark Template
const vavTemplate: DefCompTemplate = {
  id: 'vav-standard-v1',
  name: 'Standard VAV Template',
  description: 'Standard VAV box defcomp with zone control',
  
  defcompCode: `
defcomp ^vav
  mandatory ^zone ^air ^temp ^sensor ^point
  mandatory ^damper ^cmd ^point
  optional ^zone ^temp ^sp ^point
  optional ^effective ^sp ^point
  optional ^discharge ^air ^temp ^sensor ^point
  optional ^discharge ^air ^flow ^sensor ^point
  optional ^reheat ^valve ^cmd ^point
  optional ^heating ^cmd ^point
  optional ^occupied ^cmd ^point
end
  `,
  
  matcher: {
    requiredTags: ['equip', 'vav'],
    markerTag: 'vav',
    excludeTags: ['obsolete']
  },
  
  metadata: {
    version: '1.0.0',
    author: 'HVAC Team',
    category: 'hvac',
    tags: ['vav', 'zone-control'],
    compatible: ['3.0.x', '3.1.x']
  },
  
  options: {
    overwriteExisting: false,
    validateBeforeApply: true,
    dryRunFirst: true,
    batchSize: 20
  }
};
```

### 1.3 Template Storage

```typescript
// Store templates in workspace
.vscode/
  axon-templates/
    defcomp/
      hvac/
        ahu-standard.json
        vav-standard.json
        rtu-standard.json
      lighting/
        zone-lighting.json
      energy/
        meter-template.json
    xeto/                          // Future: XETO specs
      lib/
        phIoT/
        phScience/
```

---

## Phase 2: Schema Analysis & Matching

### 2.1 Query Project Schema

```typescript
// src/templates/SchemaAnalyzer.ts
export class SchemaAnalyzer {
  private mcpServer: McpServerManager;
  private skysparkClient: SkySparkClient;

  async analyzeProject(projectId: string): Promise<ProjectAnalysis> {
    // 1. Get all equipment records
    const equipment = await this.mcpServer.sendRequest('queryRecords', {
      filter: 'equip',
      projectId
    });

    // 2. Analyze each equipment type
    const analysis: Map<string, EquipmentGroup> = new Map();
    
    for (const record of equipment) {
      const equipType = this.identifyEquipmentType(record);
      
      if (!analysis.has(equipType)) {
        analysis.set(equipType, {
          type: equipType,
          count: 0,
          records: [],
          hasDefcomp: 0,
          needsDefcomp: 0,
          commonTags: new Set(),
          pointPatterns: []
        });
      }
      
      const group = analysis.get(equipType)!;
      group.count++;
      group.records.push(record);
      
      // Check if already has defcomp
      if (this.hasDefcomp(record)) {
        group.hasDefcomp++;
      } else {
        group.needsDefcomp++;
      }
      
      // Collect common tags
      record.tags.forEach(tag => group.commonTags.add(tag));
      
      // Analyze point structure
      const points = await this.getEquipmentPoints(record.id);
      group.pointPatterns.push(this.analyzePointPattern(points));
    }

    return {
      projectId,
      equipmentTypes: Array.from(analysis.values()),
      timestamp: Date.now()
    };
  }

  private identifyEquipmentType(record: any): string {
    // Identify by marker tags
    if (record.tags.includes('ahu')) return 'ahu';
    if (record.tags.includes('vav')) return 'vav';
    if (record.tags.includes('rtu')) return 'rtu';
    if (record.tags.includes('fcu')) return 'fcu';
    if (record.tags.includes('chiller')) return 'chiller';
    if (record.tags.includes('boiler')) return 'boiler';
    if (record.tags.includes('meter')) return 'meter';
    return 'unknown';
  }

  private hasDefcomp(record: any): boolean {
    // Check if record has defcomp applied
    return record.tags.some(tag => 
      tag.startsWith('defcomp:') || 
      tag === 'hasDefcomp'
    );
  }

  private async getEquipmentPoints(equipId: string): Promise<any[]> {
    return this.mcpServer.sendRequest('queryRecords', {
      filter: `point and equipRef==@${equipId}`
    });
  }

  private analyzePointPattern(points: any[]): PointPattern {
    return {
      total: points.length,
      sensors: points.filter(p => p.tags.includes('sensor')).length,
      commands: points.filter(p => p.tags.includes('cmd')).length,
      points: points.map(p => ({
        name: p.dis,
        tags: p.tags,
        kind: this.identifyPointKind(p)
      }))
    };
  }
}
```

### 2.2 Template Matching

```typescript
// src/templates/TemplateMatcher.ts
export class TemplateMatcher {
  matchTemplates(
    templates: DefCompTemplate[],
    analysis: ProjectAnalysis
  ): TemplateMatch[] {
    const matches: TemplateMatch[] = [];

    for (const equipGroup of analysis.equipmentTypes) {
      // Skip if all already have defcomp
      if (equipGroup.needsDefcomp === 0) continue;

      // Find matching templates
      const compatibleTemplates = templates.filter(template => 
        this.isCompatible(template, equipGroup)
      );

      if (compatibleTemplates.length === 0) continue;

      // Rank templates by match quality
      const rankedTemplates = this.rankTemplates(
        compatibleTemplates,
        equipGroup
      );

      // Create match record
      matches.push({
        equipmentType: equipGroup.type,
        recordCount: equipGroup.needsDefcomp,
        records: equipGroup.records.filter(r => !this.hasDefcomp(r)),
        templates: rankedTemplates,
        confidence: this.calculateConfidence(rankedTemplates[0], equipGroup),
        recommendation: this.generateRecommendation(rankedTemplates[0], equipGroup)
      });
    }

    return matches;
  }

  private isCompatible(
    template: DefCompTemplate,
    equipGroup: EquipmentGroup
  ): boolean {
    const { matcher } = template;

    // Check marker tag
    if (!equipGroup.commonTags.has(matcher.markerTag)) {
      return false;
    }

    // Check required tags
    const hasRequired = matcher.requiredTags.every(tag =>
      equipGroup.commonTags.has(tag)
    );
    if (!hasRequired) return false;

    // Check excluded tags
    if (matcher.excludeTags) {
      const hasExcluded = matcher.excludeTags.some(tag =>
        equipGroup.commonTags.has(tag)
      );
      if (hasExcluded) return false;
    }

    return true;
  }

  private rankTemplates(
    templates: DefCompTemplate[],
    equipGroup: EquipmentGroup
  ): RankedTemplate[] {
    return templates
      .map(template => ({
        template,
        score: this.calculateMatchScore(template, equipGroup)
      }))
      .sort((a, b) => b.score - a.score);
  }

  private calculateMatchScore(
    template: DefCompTemplate,
    equipGroup: EquipmentGroup
  ): number {
    let score = 100;

    // Penalty for missing optional tags
    if (template.matcher.optionalTags) {
      const missingOptional = template.matcher.optionalTags.filter(
        tag => !equipGroup.commonTags.has(tag)
      );
      score -= missingOptional.length * 5;
    }

    // Bonus for version compatibility
    // (would check SkySpark version here)

    // Bonus for point pattern match
    score += this.scorePointPatternMatch(template, equipGroup);

    return score;
  }

  private calculateConfidence(
    template: RankedTemplate,
    equipGroup: EquipmentGroup
  ): number {
    // Return 0-1 confidence score
    return template.score / 100;
  }

  private generateRecommendation(
    template: RankedTemplate,
    equipGroup: EquipmentGroup
  ): string {
    const confidence = this.calculateConfidence(template, equipGroup);
    
    if (confidence > 0.9) {
      return `High confidence match. Safe to apply to ${equipGroup.needsDefcomp} records.`;
    } else if (confidence > 0.7) {
      return `Good match. Review sample before applying to all ${equipGroup.needsDefcomp} records.`;
    } else if (confidence > 0.5) {
      return `Moderate match. Manual review recommended for ${equipGroup.needsDefcomp} records.`;
    } else {
      return `Low confidence. Consider custom template for ${equipGroup.needsDefcomp} records.`;
    }
  }
}
```

---

## Phase 3: Interactive Template Application

### 3.1 User Workflow

```typescript
// Command: "Axon: Apply DefComp Templates"

async function applyDefCompTemplates() {
  // Step 1: Analyze project
  showProgress("Analyzing project schema...");
  const analysis = await schemaAnalyzer.analyzeProject(currentProject);
  
  // Step 2: Match templates
  showProgress("Matching templates...");
  const matches = await templateMatcher.matchTemplates(templates, analysis);
  
  if (matches.length === 0) {
    showMessage("✅ All equipment already has defcomp applied!");
    return;
  }
  
  // Step 3: Show matches in UI
  const matchView = await showTemplateMatchView(matches);
  
  // User reviews and selects which to apply
  const selected = await matchView.getUserSelection();
  
  // Step 4: Generate application code
  showProgress("Generating application code...");
  const code = await generateApplicationCode(selected);
  
  // Step 5: Dry run (if enabled)
  if (selected.some(s => s.template.options.dryRunFirst)) {
    showProgress("Running dry-run test...");
    const dryRunResult = await executeDryRun(code);
    
    if (!dryRunResult.success) {
      const fix = await handleDryRunErrors(dryRunResult, code);
      code = fix;
    }
  }
  
  // Step 6: Show confirmation with summary
  const confirmed = await showConfirmationDialog({
    title: "Apply DefComp Templates",
    message: `Apply templates to ${selected.reduce((sum, s) => sum + s.recordCount, 0)} records?`,
    details: generateSummary(selected),
    actions: ['Apply', 'Review Code', 'Cancel']
  });
  
  if (confirmed === 'Apply') {
    // Step 7: Execute application
    await executeApplication(code, selected);
  } else if (confirmed === 'Review Code') {
    // Show generated code in editor
    await showGeneratedCode(code);
  }
}
```

### 3.2 Template Match View

```typescript
// React component: TemplateMatchView.tsx
export const TemplateMatchView: React.FC<Props> = ({ matches }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return (
    <div className="template-match-view">
      <h2>DefComp Template Matches</h2>
      
      {matches.map(match => (
        <MatchCard key={match.equipmentType}>
          <Header>
            <EquipmentIcon type={match.equipmentType} />
            <Title>{match.equipmentType.toUpperCase()}</Title>
            <Badge>{match.recordCount} records need defcomp</Badge>
          </Header>
          
          <TemplateSelector
            templates={match.templates}
            selected={selected.has(match.equipmentType)}
            onSelect={(template) => handleSelect(match, template)}
          />
          
          <Confidence score={match.confidence}>
            <ProgressBar value={match.confidence * 100} />
            <Text>{(match.confidence * 100).toFixed(0)}% match</Text>
          </Confidence>
          
          <Recommendation>{match.recommendation}</Recommendation>
          
          <Actions>
            <Button onClick={() => previewTemplate(match)}>
              Preview Template
            </Button>
            <Button onClick={() => previewRecords(match)}>
              View {match.recordCount} Records
            </Button>
          </Actions>
        </MatchCard>
      ))}
      
      <Summary>
        <h3>Summary</h3>
        <p>Total records: {totalRecords}</p>
        <p>Templates selected: {selected.size}</p>
        <Button primary onClick={onApply}>
          Apply Selected Templates
        </Button>
      </Summary>
    </div>
  );
};
```

---

## Phase 4: Code Generation & Execution

### 4.1 Generate Application Code

```typescript
// src/templates/CodeGenerator.ts
export class DefCompCodeGenerator {
  generateApplicationCode(selections: TemplateSelection[]): string {
    const code = [];
    
    // Header
    code.push(`// DefComp Template Application`);
    code.push(`// Generated: ${new Date().toISOString()}`);
    code.push(`// Templates: ${selections.map(s => s.template.name).join(', ')}`);
    code.push(``);
    
    // Main function
    code.push(`defx applyDefCompTemplates(options: {}) do`);
    code.push(`  dryRun: options.get("dryRun", false)`);
    code.push(`  results: []`);
    code.push(``);
    
    // Apply each template
    for (const selection of selections) {
      code.push(this.generateTemplateApplication(selection));
    }
    
    // Return results
    code.push(``);
    code.push(`  results.toGrid`);
    code.push(`end`);
    
    return code.join('\n');
  }

  private generateTemplateApplication(selection: TemplateSelection): string {
    const { template, records } = selection;
    const code = [];
    
    code.push(`  // Apply ${template.name} to ${records.length} records`);
    code.push(`  try`);
    
    // Define defcomp if not exists
    code.push(`    ${template.defcompCode}`);
    code.push(``);
    
    // Apply to each record
    if (template.options.batchSize > 1) {
      code.push(`    // Apply in batches of ${template.options.batchSize}`);
      code.push(`    recs: readAll(${this.generateFilter(template)})`);
      code.push(`    recs.each() rec => do`);
      code.push(`      if (not dryRun) do`);
      code.push(`        commit(diff(rec.id, {defcomp: ^${this.getDefcompName(template)}}, {transient}))`);
      code.push(`      end`);
      code.push(`      results = results.add({`);
      code.push(`        id: rec.id,`);
      code.push(`        dis: rec->dis,`);
      code.push(`        template: "${template.name}",`);
      code.push(`        status: "applied"`);
      code.push(`      })`);
      code.push(`    end`);
    } else {
      // Apply one at a time
      for (const record of records) {
        code.push(`    // ${record.dis}`);
        code.push(`    if (not dryRun) do`);
        code.push(`      commit(diff(@${record.id}, {defcomp: ^${this.getDefcompName(template)}}, {transient}))`);
        code.push(`    end`);
        code.push(`    results = results.add({`);
        code.push(`      id: @${record.id},`);
        code.push(`      dis: "${record.dis}",`);
        code.push(`      template: "${template.name}",`);
        code.push(`      status: "applied"`);
        code.push(`    })`);
      }
    }
    
    code.push(`  catch (err)`);
    code.push(`    results = results.add({error: err.toStr, template: "${template.name}"})`);
    code.push(`  end`);
    code.push(``);
    
    return code.join('\n    ');
  }

  private generateFilter(template: DefCompTemplate): string {
    const { matcher } = template;
    const parts = [];
    
    parts.push('equip');
    parts.push(`and ${matcher.markerTag}`);
    
    if (matcher.excludeTags) {
      matcher.excludeTags.forEach(tag => {
        parts.push(`and not ${tag}`);
      });
    }
    
    if (matcher.customFilter) {
      parts.push(`and ${matcher.customFilter}`);
    }
    
    return parts.join(' ');
  }

  private getDefcompName(template: DefCompTemplate): string {
    // Extract defcomp name from code
    const match = template.defcompCode.match(/defcomp \^(\w+)/);
    return match ? match[1] : 'unknown';
  }
}
```

### 4.2 Execute with Validation

```typescript
// src/templates/TemplateApplier.ts
export class TemplateApplier {
  async applyTemplates(
    code: string,
    selections: TemplateSelection[]
  ): Promise<ApplicationResult> {
    const results = {
      total: 0,
      applied: 0,
      failed: 0,
      errors: [],
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Step 1: Validate code syntax
      await this.validateSyntax(code);
      
      // Step 2: Dry run first
      const dryRunResult = await this.executeDryRun(code);
      
      if (!dryRunResult.success) {
        throw new Error(`Dry run failed: ${dryRunResult.errors.join(', ')}`);
      }
      
      // Step 3: Execute actual application
      const execResult = await this.skysparkClient.eval(code);
      
      // Step 4: Parse results
      results.total = selections.reduce((sum, s) => sum + s.recordCount, 0);
      results.applied = execResult.filter(r => r.status === 'applied').length;
      results.failed = execResult.filter(r => r.error).length;
      results.errors = execResult.filter(r => r.error).map(r => r.error);
      
      // Step 5: Verify application
      await this.verifyApplication(selections);
      
    } catch (error) {
      results.errors.push(error.message);
    }

    results.duration = Date.now() - startTime;
    return results;
  }

  private async executeDryRun(code: string): Promise<DryRunResult> {
    // Execute with dryRun flag
    const result = await this.skysparkClient.eval(`
      ${code}
      applyDefCompTemplates({dryRun: true})
    `);

    return {
      success: !result.some(r => r.error),
      recordCount: result.length,
      errors: result.filter(r => r.error).map(r => r.error)
    };
  }

  private async verifyApplication(
    selections: TemplateSelection[]
  ): Promise<void> {
    for (const selection of selections) {
      const defcompName = this.getDefcompName(selection.template);
      
      // Query records to verify defcomp applied
      const verified = await this.skysparkClient.eval(`
        readAll(${this.generateFilter(selection.template)} and defcomp==^${defcompName}).size
      `);
      
      if (verified !== selection.recordCount) {
        throw new Error(
          `Verification failed for ${selection.template.name}: ` +
          `Expected ${selection.recordCount}, got ${verified}`
        );
      }
    }
  }
}
```

---

## Phase 5: Template Library Management

### 5.1 Template Manager UI

```typescript
// Command: "Axon: Manage DefComp Templates"

export const TemplateLibraryView: React.FC = () => {
  const [templates, setTemplates] = useState<DefCompTemplate[]>([]);
  const [filter, setFilter] = useState('');

  return (
    <div className="template-library">
      <Header>
        <h2>DefComp Template Library</h2>
        <Actions>
          <Button onClick={importTemplate}>Import Template</Button>
          <Button onClick={createTemplate}>Create New</Button>
          <Button onClick={syncTemplates}>Sync Library</Button>
        </Actions>
      </Header>

      <Search
        placeholder="Search templates..."
        value={filter}
        onChange={setFilter}
      />

      <TemplateList>
        {templates
          .filter(t => matchesFilter(t, filter))
          .map(template => (
            <TemplateCard key={template.id}>
              <CardHeader>
                <Title>{template.name}</Title>
                <Version>v{template.metadata.version}</Version>
                <Category>{template.metadata.category}</Category>
              </CardHeader>
              
              <Description>{template.description}</Description>
              
              <Tags>
                {template.metadata.tags.map(tag => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </Tags>
              
              <Matcher>
                <Label>Matches:</Label>
                <TagList>
                  {template.matcher.requiredTags.map(tag => (
                    <RequiredTag key={tag}>{tag}</RequiredTag>
                  ))}
                </TagList>
              </Matcher>
              
              <CardActions>
                <Button onClick={() => editTemplate(template)}>
                  Edit
                </Button>
                <Button onClick={() => previewTemplate(template)}>
                  Preview
                </Button>
                <Button onClick={() => testTemplate(template)}>
                  Test Match
                </Button>
                <Button onClick={() => deleteTemplate(template)}>
                  Delete
                </Button>
              </CardActions>
            </TemplateCard>
          ))}
      </TemplateList>
    </div>
  );
};
```

### 5.2 Template Import/Export

```typescript
// Import template from file
async function importTemplate(): Promise<void> {
  const file = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: {
      'Template Files': ['json', 'yaml'],
      'All Files': ['*']
    }
  });

  if (!file || file.length === 0) return;

  const content = await fs.readFile(file[0].fsPath, 'utf8');
  const template = JSON.parse(content) as DefCompTemplate;

  // Validate template
  await validateTemplate(template);

  // Add to library
  await templateManager.addTemplate(template);

  vscode.window.showInformationMessage(
    `Imported template: ${template.name}`
  );
}

// Export template to file
async function exportTemplate(template: DefCompTemplate): Promise<void> {
  const file = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${template.id}.json`),
    filters: {
      'JSON': ['json'],
      'YAML': ['yaml']
    }
  });

  if (!file) return;

  const content = JSON.stringify(template, null, 2);
  await fs.writeFile(file.fsPath, content, 'utf8');

  vscode.window.showInformationMessage(
    `Exported template: ${template.name}`
  );
}
```

---

## Phase 6: AI-Assisted Template Creation

### 6.1 Generate Template from Records

```typescript
// Command: "Axon: Generate DefComp Template from Selection"

async function generateTemplateFromRecords(recordIds: string[]): Promise<void> {
  // Step 1: Analyze records
  showProgress("Analyzing selected records...");
  const records = await Promise.all(
    recordIds.map(id => skysparkClient.readById(id))
  );

  // Step 2: Extract common patterns
  const analysis = analyzeRecordPatterns(records);

  // Step 3: AI generates template
  showProgress("Generating template with AI...");
  const template = await generateTemplateWithAI(analysis);

  // Step 4: Show template for review
  const edited = await showTemplateEditor(template);

  // Step 5: Save to library
  if (edited) {
    await templateManager.addTemplate(edited);
    vscode.window.showInformationMessage(
      `✅ Created template: ${edited.name}`
    );
  }
}

async function generateTemplateWithAI(
  analysis: RecordAnalysis
): Promise<DefCompTemplate> {
  const provider = providerManager.getActiveProvider();

  const prompt = `
Generate a defcomp Spark template for SkySpark based on this analysis:

EQUIPMENT TYPE: ${analysis.equipmentType}
RECORD COUNT: ${analysis.recordCount}

COMMON TAGS:
${analysis.commonTags.join(', ')}

POINT PATTERNS:
${analysis.pointPatterns.map(p => `- ${p.name}: ${p.tags.join(', ')}`).join('\n')}

MANDATORY POINTS (present in 90%+ of records):
${analysis.mandatoryPoints.map(p => `- ${p.name}: ${p.tags.join(' ')}`).join('\n')}

OPTIONAL POINTS (present in 50-90% of records):
${analysis.optionalPoints.map(p => `- ${p.name}: ${p.tags.join(' ')}`).join('\n')}

Generate:
1. Defcomp Spark code with mandatory and optional sections
2. Template metadata (name, description, category)
3. Matcher configuration (required/optional tags)
4. Recommendations for template application

Format as JSON matching DefCompTemplate interface.
`;

  const result = await provider.actMode(
    { steps: ['Analyze patterns', 'Generate template', 'Validate'] },
    { task: prompt, schemaContext: analysis }
  );

  return JSON.parse(result.code);
}
```

---

## Version 2: XETO Spec Migration Path

### Future Enhancement: XETO Integration

```typescript
// src/templates/XetoMigration.ts

/**
 * Version 2 will support XETO specs alongside defcomp
 * 
 * Migration path:
 * 1. Keep existing defcomp templates working
 * 2. Add XETO spec support
 * 3. Provide conversion tool: defcomp → XETO
 * 4. Support both formats in parallel
 * 5. Eventually deprecate defcomp in favor of XETO
 */

export interface XetoSpec {
  // XETO spec structure
  // To be implemented in V2
}

export class XetoConverter {
  async convertDefCompToXeto(
    template: DefCompTemplate
  ): Promise<XetoSpec> {
    // Convert defcomp Spark template to XETO spec
    // Implementation for V2
  }

  async validateXetoSpec(spec: XetoSpec): Promise<ValidationResult> {
    // Validate XETO spec
    // Implementation for V2
  }
}

// Template structure will support both:
export interface UnifiedTemplate {
  format: 'defcomp' | 'xeto';
  defcomp?: DefCompTemplate;  // V1
  xeto?: XetoSpec;            // V2
}
```

---

## Configuration

```json
// .vscode/settings.json
{
  "axon.templates": {
    "libraryPath": ".vscode/axon-templates",
    "autoMatch": true,
    "dryRunDefault": true,
    "validation": {
      "checkBeforeApply": true,
      "requireMinimumConfidence": 0.7
    },
    "application": {
      "defaultBatchSize": 10,
      "overwriteExisting": false,
      "trackChanges": true
    },
    "xeto": {
      "enabled": false,  // V2 feature
      "preferXeto": false
    }
  }
}
```

---

## User Workflows

### Workflow 1: Apply Existing Templates

```
1. User: Open Command Palette
2. User: "Axon: Apply DefComp Templates"
3. Extension: Analyzes project schema
4. Extension: Matches 15 AHU, 40 VAV, 8 RTU records
5. Extension: Shows match view with confidence scores
6. User: Reviews and selects templates
7. Extension: Generates application code
8. Extension: Runs dry-run test
9. Extension: "✅ Dry run passed. Apply to 63 records?"
10. User: Confirms
11. Extension: Applies templates
12. Extension: "✅ Applied 3 templates to 63 records in 12s"
```

### Workflow 2: Create Custom Template

```
1. User: Selects 10 similar AHU records
2. User: "Axon: Generate Template from Selection"
3. Extension: Analyzes records
4. Extension: AI generates template
5. Extension: Shows template editor
6. User: Reviews and adjusts
7. User: Saves template
8. Extension: "✅ Template 'Custom AHU v1' added to library"
```

### Workflow 3: Manage Template Library

```
1. User: "Axon: Manage DefComp Templates"
2. Extension: Shows template library UI
3. User: Views 25 templates across categories
4. User: Clicks "Test Match" on AHU template
5. Extension: "Matches 15 records (95% confidence)"
6. User: Exports template for team sharing
7. Extension: "✅ Exported to team-templates/ahu-v2.json"
```

---

## Success Metrics

### Template Application Quality

**Target: 95%+ Successful Applications**

- ✅ Schema matching accuracy: >90%
- ✅ Application success rate: >95%
- ✅ Zero unintended overwrites
- ✅ Validation catches 100% of conflicts

### Developer Productivity

**Time Saved:**
- Manual defcomp application: 5-10 min per equipment × 100 equipment = 8-16 hours
- With extension: 5 min total (analyze + apply)
- **Savings: 99% time reduction**

### Template Library Growth

- Start: 5-10 standard templates
- After 3 months: 50+ templates
- Community sharing enabled

---

## Conclusion

This defcomp template management system provides:

1. ✅ **Automated matching** - AI matches templates to records
2. ✅ **Safe application** - Dry-run testing before applying
3. ✅ **Template library** - Reusable templates across projects
4. ✅ **AI assistance** - Generate templates from examples
5. ✅ **Version 2 ready** - Clear path to XETO migration

The system handles the 90% of boilerplate template application, leaving 10% for business-specific customization—exactly the 90/10 split we're targeting!
