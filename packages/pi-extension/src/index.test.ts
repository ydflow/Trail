import { afterEach, describe, expect, it } from 'bun:test';
import { registerProviderOverrides, registerTools, tools } from './index.ts';

afterEach(() => {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.FINAGENT_PROVIDER_OVERRIDES;
});

describe('pi extension registration', () => {
  it('completes custom model descriptors required by the actual Pi providers', () => {
    process.env.FINAGENT_PROVIDER_OVERRIDES = JSON.stringify([{
      provider: 'custom-model', baseUrl: 'http://127.0.0.1:1/v1', api: 'openai-completions',
      models: [{ id: 'text-model', reasoning: true, contextWindow: 64000, maxTokens: 4096 }],
    }]);
    const models: Array<Record<string, unknown>> = [];
    registerProviderOverrides({ registerTool: () => {}, registerProvider: (_name, config) => {
      models.push(...(config.models ?? []) as unknown as Array<Record<string, unknown>>);
    } });
    expect(models[0]).toMatchObject({
      id: 'text-model', name: 'text-model', input: ['text'], reasoning: true,
      contextWindow: 64000, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it('uses system messages for reasoning models on compatible gateways by default', () => {
    process.env.FINAGENT_PROVIDER_OVERRIDES = JSON.stringify([{
      provider: 'deepseek-flash', api: 'openai-completions',
      models: [{ id: 'deepseek-flash', reasoning: true }, { id: 'opt-in', compat: { supportsDeveloperRole: true } }],
    }]);
    const registered: Array<{ compat?: { supportsDeveloperRole?: boolean } }> = [];
    registerProviderOverrides({ registerTool: () => {}, registerProvider: (_name, config) => {
      registered.push(...(config.models ?? []));
    } });
    expect(registered[0]?.compat?.supportsDeveloperRole).toBe(false);
    expect(registered[1]?.compat?.supportsDeveloperRole).toBe(true);
  });

  it('registers all finance tools', () => {
    const registered: string[] = [];

    registerTools({
      registerTool: (tool) => {
        registered.push(tool.name);
      },
    });

    expect(registered).toEqual(tools.map((tool) => tool.name));
  });

  it('does not point anthropic at a vendor relay when nothing is configured', () => {
    const previous = process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_BASE_URL;
    const calls: Array<{ name: string; config: { baseUrl?: string } }> = [];

    try {
      registerProviderOverrides({
        registerTool: () => undefined,
        registerProvider: (name, config) => {
          calls.push({ name, config });
        },
      });
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_BASE_URL = previous;
    }

    expect(calls).toEqual([]);
  });

  it('prefers ANTHROPIC_BASE_URL from the environment', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://example.test/anthropic';
    const calls: Array<{ name: string; config: { baseUrl?: string } }> = [];

    registerProviderOverrides({
      registerTool: () => undefined,
      registerProvider: (name, config) => {
        calls.push({ name, config });
      },
    });

    expect(calls[0]).toEqual({
      name: 'anthropic',
      config: { baseUrl: 'https://example.test/anthropic' },
    });
  });
});
