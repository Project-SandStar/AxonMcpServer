# Phase 3: AI Provider Integration - Architecture Design

## Overview

Phase 3 implements the core AI-powered code generation system using a **Plan-Act Workflow** pattern. This two-phase approach optimizes for both cost and quality by using different models for planning and execution.

## Plan-Act Workflow

### Architecture Diagram

```
User Request
     ↓
Context Gatherer ──→ MCP Server (examples, docs, schema)
     ↓                     ↓
     └─────→ Plan Phase (Haiku) ←─────┘
                   ↓
              Plan Review
                   ↓
              User Approval
                   ↓
     ┌─────→ Act Phase (Sonnet) ←─────┐
     ↓                                  ↓
Generated Code                    MCP Context
     ↓
User Acceptance
     ↓
Code Insertion
```

### Phase Breakdown

#### 1. Plan Phase (Haiku)
**Model**: `claude-3-haiku-20240307` (fast, cheap)

**Purpose**: Analyze the request and create an execution plan

**Inputs**:
- User request/instruction
- Current editor context (selected code, cursor position)
- Relevant examples from MCP server
- Project schema from MCP server
- Conversation history

**Outputs**:
- Structured plan with steps
- Required context identification
- Potential challenges
- Estimated complexity

**Example Plan Output**:
```json
{
  "summary": "Create an Axon function to calculate average temperature",
  "steps": [
    "Query points with 'temp' tag",
    "Read historical data for past 24 hours",
    "Calculate average using fold()",
    "Return result with unit"
  ],
  "requiredContext": [
    "fold() function documentation",
    "readAll() examples",
    "point query patterns"
  ],
  "complexity": "medium",
  "estimatedLines": 15
}
```

#### 2. Act Phase (Sonnet)
**Model**: `claude-sonnet-4-20250514` (capable, high-quality)

**Purpose**: Generate the actual code based on approved plan

**Inputs**:
- Approved plan from Phase 1
- Enhanced context (based on plan's requirements)
- Axon language rules and best practices
- Example code patterns
- Conversation history

**Outputs**:
- Complete Axon code
- Inline comments explaining logic
- Usage examples
- Test suggestions

## Core Components

### 1. WorkflowOrchestrator

**Location**: `src/ai/WorkflowOrchestrator.ts`

**Responsibilities**:
- Coordinate plan and act phases
- Manage model switching
- Handle errors and retries
- Aggregate results

**Key Methods**:
```typescript
async executePlanActWorkflow(request: GenerationRequest): Promise<GenerationResult>
async executePlanPhase(request: GenerationRequest): Promise<Plan>
async executeActPhase(plan: Plan): Promise<Code>
```

### 2. PromptBuilder

**Location**: `src/ai/prompts/PromptBuilder.ts`

**Responsibilities**:
- Template-based prompt generation
- Context injection
- Few-shot example formatting
- Token counting and truncation

**Key Methods**:
```typescript
buildPlanPrompt(request: GenerationRequest, context: Context): string
buildActPrompt(plan: Plan, context: Context): string
injectContext(template: string, context: Context): string
```

### 3. ContextGatherer

**Location**: `src/ai/ContextGatherer.ts`

**Responsibilities**:
- Query MCP server for relevant context
- Extract editor context
- Gather project schema
- Prune context to fit token limits

**Key Methods**:
```typescript
async gatherContext(request: GenerationRequest): Promise<Context>
async queryRelevantExamples(query: string): Promise<Example[]>
async getProjectSchema(): Promise<Schema>
pruneContext(context: Context, maxTokens: number): Context
```

### 4. ConversationManager

**Location**: `src/ai/ConversationManager.ts`

**Responsibilities**:
- Store conversation history
- Manage context window
- Summarize old conversations
- Support multi-turn interactions

**Key Methods**:
```typescript
addMessage(role: 'user' | 'assistant', content: string): void
getHistory(maxTokens: number): Message[]
summarizeOldMessages(): void
clearHistory(): void
```

### 5. CodeGenerationPanel (UI)

**Location**: `src/ui/CodeGenerationPanel.ts`

**Responsibilities**:
- Display interactive chat interface
- Show plan for approval
- Stream generation progress
- Display code with syntax highlighting
- Provide diff view for modifications

**Features**:
- Real-time streaming updates
- Plan approval/rejection
- Code acceptance/rejection
- Regeneration with feedback
- Conversation history display

## Data Models

### GenerationRequest
```typescript
interface GenerationRequest {
  type: 'function' | 'explain' | 'optimize' | 'test';
  instruction: string;
  context: {
    selectedCode?: string;
    fileName?: string;
    cursorPosition?: number;
    projectPath?: string;
  };
  conversationId?: string;
}
```

### Plan
```typescript
interface Plan {
  summary: string;
  steps: string[];
  requiredContext: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedLines: number;
  warnings?: string[];
}
```

### Code
```typescript
interface Code {
  code: string;
  language: 'axon';
  explanation: string;
  examples?: string[];
  tests?: string[];
}
```

### Context
```typescript
interface Context {
  examples: Example[];
  documentation: DocEntry[];
  schema: ProjectSchema;
  editorContext: EditorContext;
  conversationHistory: Message[];
}
```

## Prompt Templates

### System Prompts

**Plan Phase System Prompt**:
```
You are an expert Axon developer planning code generation tasks.

Your role:
1. Analyze the user's request carefully
2. Identify required context and examples
3. Break down the task into clear steps
4. Assess complexity and potential challenges
5. Provide a structured plan in JSON format

Available context:
- Axon language documentation
- Example code from similar implementations
- Project schema and data model

Be concise, accurate, and thorough in planning.
```

**Act Phase System Prompt**:
```
You are an expert Axon developer generating production-quality code.

Your role:
1. Follow the approved plan precisely
2. Write clean, idiomatic Axon code
3. Include helpful comments
4. Follow Axon best practices
5. Ensure code is complete and runnable

Guidelines:
- Use clear variable names
- Add comments for complex logic
- Follow SkySpark conventions
- Optimize for readability and performance
- Include error handling where appropriate

Output only valid Axon code with comments.
```

## Conversation Flow

### New Function Generation

1. **User invokes command**: "Axon: Generate Function"
2. **User provides description**: "Calculate average temperature for past 24 hours"
3. **Context gathering**: Query MCP for relevant examples and docs
4. **Plan phase**: Generate execution plan using Haiku
5. **Display plan**: Show plan in UI for user review
6. **User approves**: Click "Generate Code" button
7. **Act phase**: Generate code using Sonnet with plan and context
8. **Stream updates**: Show generation progress in real-time
9. **Display code**: Present code with syntax highlighting
10. **User accepts**: Insert code at cursor position
11. **Store history**: Save conversation for future context

### Multi-turn Interaction

1. **User**: "Generate a function to query points"
2. **Assistant**: [Generates basic query function]
3. **User**: "Add filtering by site"
4. **Assistant**: [Modifies code with site filter using conversation history]
5. **User**: "Add error handling"
6. **Assistant**: [Adds try-catch with conversation context]

## Error Handling

### Plan Phase Errors
- Retry with simplified prompt
- Fall back to direct code generation
- Request user clarification

### Act Phase Errors
- Retry with modified plan
- Request additional context
- Suggest manual implementation

### MCP Server Errors
- Use cached context if available
- Continue with reduced context
- Notify user of degraded functionality

## Performance Considerations

### Token Management
- **Plan phase budget**: ~2,000 tokens
- **Act phase budget**: ~4,000 tokens
- Context pruning strategies:
  - Prioritize recent examples
  - Summarize documentation
  - Truncate old conversation history

### Streaming
- Stream Act phase responses for better UX
- Update UI progressively
- Allow cancellation at any point

### Caching
- Cache frequent MCP queries
- Store project schema in memory
- Cache prompt templates

## Security & Privacy

### API Key Management
- Store keys in VSCode secrets
- Never log API keys
- Validate keys before use

### Code Privacy
- All processing happens via Anthropic API
- No code sent to third-party services
- User code stays in local context

### User Data
- Conversation history stored locally
- Can be cleared by user
- Not synced or uploaded

## Testing Strategy

### Unit Tests
- PromptBuilder template rendering
- ContextGatherer context pruning
- ConversationManager history management
- Mock AI responses for testing

### Integration Tests
- Full plan-act workflow
- Context gathering from MCP
- Streaming response handling
- Error recovery scenarios

### Manual Testing
- Generate various code types
- Test multi-turn conversations
- Verify plan approval flow
- Test cancellation and retries

## Metrics & Monitoring

### Track:
- Plan phase latency
- Act phase latency
- Token usage (plan vs act)
- User acceptance rate
- Error rates
- Regeneration frequency

### Optimize for:
- Fast plan generation (<2s)
- High-quality code output (>80% acceptance)
- Low token usage
- Minimal errors

## Future Enhancements (Phase 4+)

- Semantic caching for repeated requests
- Fine-tuned models for Axon
- Multi-file code generation
- Automated testing integration
- Code review suggestions
- Refactoring workflows

---

**Status**: Architecture Designed ✅  
**Next**: Implementation of core components
