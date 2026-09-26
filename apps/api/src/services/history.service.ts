import { env } from '../config/env';
import { getLLMProvider } from '../providers/llm';
import { updateConversationSummary, ConversationRow } from '../repositories/conversation.repository';
import { MessageRow } from '../repositories/message.repository';

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer for a document-Q&A assistant.
Given a prior summary and a batch of new messages, produce an updated summary that captures:
- Topics discussed and questions answered
- Key facts the user mentioned about themselves or their project
- The user's current goal or question thread
- Any preferences or constraints the user expressed

Keep the summary under 300 words. Do NOT include specific document names, citations, or long quotes. Use plain prose, not bullet points.`;

export interface BuiltContext {
  summary: string | null;
  recentMessages: MessageRow[];
}

/**
 * Given a conversation and its full message list, returns:
 *  - the (possibly refreshed) rolling summary
 *  - the recent messages to pass verbatim to the LLM
 *
 * Side effect: may call the summarizer and persist a new summary.
 * Failures are non-fatal — the caller falls back to the existing summary.
 */
export async function buildConversationContext(
  conversation: ConversationRow,
  messages: MessageRow[]
): Promise<BuiltContext> {
  const recentCount = env.HISTORY_RECENT_MESSAGES;
  const minSummarize = env.HISTORY_SUMMARY_MIN_MESSAGES;

  // Not enough history yet — pass everything, no summarization.
  if (messages.length <= recentCount) {
    return { summary: conversation.summary, recentMessages: messages };
  }

  const splitIndex = messages.length - recentCount;
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);
  const newestOlderId = olderMessages[olderMessages.length - 1]?.id;

  // Already summarized up to the newest "old" message — nothing to do.
  if (conversation.summary_through_message_id === newestOlderId) {
    return { summary: conversation.summary, recentMessages };
  }

  // Determine which messages still need to be folded into the summary.
  let unsummarized: MessageRow[];
  if (!conversation.summary_through_message_id) {
    unsummarized = olderMessages;
  } else {
    const idx = olderMessages.findIndex(
      (m) => m.id === conversation.summary_through_message_id
    );
    unsummarized = idx === -1 ? olderMessages : olderMessages.slice(idx + 1);
  }

  if (unsummarized.length < minSummarize) {
    return { summary: conversation.summary, recentMessages };
  }

  // Build the summarization prompt.
  const newText = unsummarized
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const prompt = conversation.summary
    ? `Existing summary:\n${conversation.summary}\n\nNew messages to incorporate:\n${newText}\n\nProduce an updated summary.`
    : `Messages to summarize:\n${newText}\n\nProduce a summary.`;

  // Attempt summarization. Non-fatal on failure.
  const llm = getLLMProvider();
  let newSummary: string;
  try {
    newSummary = await llm.complete(prompt, SUMMARY_SYSTEM_PROMPT);
    if (!newSummary || newSummary.trim().length === 0) {
      throw new Error('Summarizer returned empty text');
    }
  } catch (err) {
    console.warn('[history] summarization failed, falling back:', err);
    return { summary: conversation.summary, recentMessages };
  }

  // Persist and return.
  await updateConversationSummary(conversation.id, newSummary, newestOlderId);
  return { summary: newSummary, recentMessages };
}