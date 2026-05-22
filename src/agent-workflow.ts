import { generateText } from './generate-text.js';
import { normalizeProvider } from './provider-alias.js';
import type {
  AgentToolDecision,
  AgentToolDefinition,
  AgentToolHandler,
  AgentToolRegistry,
  AgentToolStep,
  RunAgentWorkflowInput,
  RunAgentWorkflowResult,
} from './types.js';

const DEFAULT_MAX_STEPS = 8;

export async function runAgentWorkflow(input: RunAgentWorkflowInput): Promise<RunAgentWorkflowResult> {
  const provider = normalizeProvider(input.provider || input.defaultProvider || 'codex');
  const tools = normalizeTools(input.tools);
  const toolNames = Object.keys(tools);
  if (!input.instruction || !input.instruction.trim()) throw new Error('instruction is required');
  if (!toolNames.length) throw new Error('At least one tool function is required');

  const steps: AgentToolStep[] = [];
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  let final = '';
  let model = input.model;
  const rawDecisions: unknown[] = [];

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const prompt = buildDecisionPrompt(input, tools, steps);
    const decision = await getDecision(input, prompt, stepIndex, steps, toolNames);
    rawDecisions.push(decision.raw);
    if (decision.model) model = decision.model;

    if (decision.final) {
      final = decision.final;
      break;
    }

    const toolName = decision.tool;
    if (!toolName) {
      final = 'No further tool call was selected.';
      break;
    }

    const tool = tools[toolName];
    if (!tool) {
      steps.push({
        index: stepIndex,
        tool: toolName,
        args: decision.args,
        error: `Unknown tool: ${toolName}`,
      });
      break;
    }

    try {
      const result = await tool.execute(decision.args, {
        instruction: input.instruction,
        provider,
        stepIndex,
        previousSteps: steps,
      });
      steps.push({ index: stepIndex, tool: toolName, args: decision.args, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ index: stepIndex, tool: toolName, args: decision.args, error: message });
      break;
    }
  }

  if (!final && steps.length >= maxSteps) final = `Stopped after maxSteps=${maxSteps}.`;
  return { provider, model, steps, final: final || undefined, raw: { decisions: rawDecisions } };
}

function normalizeTools(tools: AgentToolRegistry | undefined): Record<string, AgentToolDefinition> {
  const normalized: Record<string, AgentToolDefinition> = {};
  for (const [name, tool] of Object.entries(tools || {})) {
    if (typeof tool === 'function') {
      normalized[name] = { description: '', execute: tool as AgentToolHandler };
    } else if (tool && typeof tool.execute === 'function') {
      normalized[name] = tool;
    }
  }
  return normalized;
}

async function getDecision(
  input: RunAgentWorkflowInput,
  prompt: string,
  stepIndex: number,
  previousSteps: AgentToolStep[],
  toolNames: string[]
): Promise<{ tool?: string; args: Record<string, unknown>; final?: string; raw: unknown; model?: string }> {
  if (input.planner) {
    const planned = await input.planner({
      provider: normalizeProvider(input.provider || input.defaultProvider || 'codex'),
      model: input.model,
      prompt,
      stepIndex,
      previousSteps,
      toolNames,
    });
    const decision = typeof planned === 'string' ? parseDecision(planned) : planned;
    return normalizeDecision(decision, planned);
  }

  const result = await generateText({
    provider: normalizeProvider(input.provider || input.defaultProvider || 'codex'),
    prompt,
    system: input.system,
    model: input.model,
    auth: input.auth,
    timeoutMs: input.timeoutMs,
    cwd: input.cwd,
    tools: 'none',
    mode: 'plan',
  });
  const decision = parseDecision(result.text);
  return { ...normalizeDecision(decision, result.raw || result.text), model: result.model };
}

function normalizeDecision(
  decision: AgentToolDecision | null,
  raw: unknown
): { tool?: string; args: Record<string, unknown>; final?: string; raw: unknown } {
  if (!decision) return { args: {}, final: 'The agent did not return a valid tool decision.', raw };
  const tool = decision.tool || decision.name;
  return {
    tool,
    args: decision.args || decision.arguments || {},
    final: decision.final,
    raw,
  };
}

function buildDecisionPrompt(input: RunAgentWorkflowInput, tools: Record<string, AgentToolDefinition>, steps: AgentToolStep[]): string {
  const toolLines = Object.entries(tools)
    .map(([name, tool]) => {
      const parameters = tool.parameters ? `\n  parameters: ${JSON.stringify(tool.parameters)}` : '';
      return `- ${name}: ${tool.description || 'No description provided.'}${parameters}`;
    })
    .join('\n');

  return [
    'You are an AI function orchestration planner.',
    'Choose the next single tool call needed for the user instruction, or finish with a final answer.',
    'You do not execute tools yourself. The host app will execute exactly the tool you choose.',
    '',
    `Instruction: ${input.instruction}`,
    '',
    'Available tools:',
    toolLines,
    '',
    'Previous tool results:',
    truncateForPrompt(JSON.stringify(steps, null, 2)),
    '',
    'Return JSON only. Use one of these shapes:',
    '{"tool":"toolName","args":{"key":"value"}}',
    '{"final":"short final answer"}',
  ].join('\n');
}

function parseDecision(text: string): AgentToolDecision | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || '',
    trimmed.match(/\{[\s\S]*\}/)?.[0] || '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as AgentToolDecision;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function truncateForPrompt(text: string): string {
  if (text.length <= 12000) return text;
  return `${text.slice(0, 12000)}\n...truncated`;
}
