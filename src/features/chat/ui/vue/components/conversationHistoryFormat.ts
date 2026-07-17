/** Formats a conversation timestamp for a history row. Same rule as the deleted
 *  ConversationHistoryView.formatDate: time-of-day if today, else "Mon D". */
export function formatConversationDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
