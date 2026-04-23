const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// ── System prompt ──────────────────────────────────────────────────────────
// Stub for now — real prompt injected later once knowledge base is ready.
function buildSystemPrompt(member) {
  const businessContext = member.businessType
    ? ` The member runs a ${member.businessType} business.`
    : '';
  const nameContext = member.name ? ` You are assisting ${member.name}.` : '';

  return `You are the TMS Vault — a business resource search assistant for members of TMS Solutions Group.${nameContext}${businessContext}

Your job is to help small business owners find relevant grants, funding programs, SBA loans, health insurance options, cost-reduction programs, and other business resources.

Guidelines:
- Be specific and actionable. Name real programs, eligibility criteria, and next steps.
- Structure your response clearly. Use headers for different resource categories.
- If you mention amounts or deadlines, note they may change and the member should verify.
- Keep responses focused and practical — members want answers they can act on today.
- Do not hallucinate programs. If you are unsure, say so and suggest where to look.`;
}

// ── Claude streaming search ────────────────────────────────────────────────
async function searchWithClaude(query, member, send) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildSystemPrompt(member),
    messages: [{ role: 'user', content: query }]
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta' &&
      event.delta.text
    ) {
      send({ chunk: event.delta.text });
    }
  }
}

// ── OpenAI streaming fallback ──────────────────────────────────────────────
async function searchWithOpenAI(query, member, send) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured — no fallback available.');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    stream: true,
    messages: [
      { role: 'system', content: buildSystemPrompt(member) },
      { role: 'user', content: query }
    ]
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) send({ chunk: text });
  }
}

// ── Main entry — Claude first, OpenAI fallback ─────────────────────────────
async function handleSearch(query, member, send) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[search] No Anthropic key — skipping to OpenAI fallback');
    return searchWithOpenAI(query, member, send);
  }

  try {
    await searchWithClaude(query, member, send);
  } catch (err) {
    console.error('[search] Claude failed:', err.message, '— trying OpenAI fallback');
    send({ chunk: '\n\n' }); // small gap in stream before fallback content
    await searchWithOpenAI(query, member, send);
  }
}

module.exports = { handleSearch };
