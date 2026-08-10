/**
 * Version of the chat WebSocket protocol this instance speaks, announced to
 * every client in `auth_ok`.
 *
 * Instances and clients are released separately and upgrade on their own
 * schedules, so a client cannot infer what a server supports from its own
 * version. Feature-sniffing the alternative -- waiting to see whether an ack
 * ever arrives -- means guessing from an absence, which is indistinguishable
 * from a dropped message.
 *
 * Bump this when a client that assumes the older shape would get a wrong
 * answer: a frame it must handle to stay correct, a field whose meaning
 * changed, a removal. Do not bump for a purely additive frame an older client
 * can safely ignore, which is most of them -- the version is for breaking
 * changes, and bumping it for anything else trains clients to ignore it.
 *
 * A client that sees no `protocol` at all is talking to an instance that
 * predates this field. Treat that as version 0.
 *
 * 1: `id` on stored messages, plus `chat_ack` / `room_chat_ack`.
 */
export const CHAT_PROTOCOL_VERSION = 1;
