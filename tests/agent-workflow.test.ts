import { describe, expect, it } from 'vitest';
import { runAgentWorkflow } from '../src/agent-workflow.js';

describe('agent workflow tools', () => {
  it('lets the selected agent plan and execute mapped functions in sequence', async () => {
    const calls: string[] = [];
    const result = await runAgentWorkflow({
      provider: 'google',
      instruction: 'Find a lead, create an invoice, then notify the lead.',
      tools: {
        findLead: {
          description: 'Find a CRM lead by phone number.',
          parameters: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
          execute: async (args) => {
            calls.push(`findLead:${args.phone}`);
            return { leadId: 'lead_123', email: 'customer@example.com' };
          },
        },
        createInvoice: {
          description: 'Create an invoice for a lead.',
          execute: async (args) => {
            calls.push(`createInvoice:${args.leadId}`);
            return { invoiceId: 'inv_456', total: 99 };
          },
        },
        sendEmail: {
          description: 'Send an email to a customer.',
          execute: async (args) => {
            calls.push(`sendEmail:${args.invoiceId}`);
            return { sent: true };
          },
        },
      },
      planner: async ({ stepIndex }) => {
        if (stepIndex === 0) return { tool: 'findLead', args: { phone: '+15550001111' } };
        if (stepIndex === 1) return { tool: 'createInvoice', args: { leadId: 'lead_123' } };
        if (stepIndex === 2) return { tool: 'sendEmail', args: { invoiceId: 'inv_456' } };
        return { final: 'Invoice created and email sent.' };
      },
    });

    expect(calls).toEqual(['findLead:+15550001111', 'createInvoice:lead_123', 'sendEmail:inv_456']);
    expect(result.provider).toBe('gemini');
    expect(result.steps).toHaveLength(3);
    expect(result.final).toBe('Invoice created and email sent.');
  });
});
