import { useTuneCampChat, formatUsernameWithInstance } from "@tunecamp/chat";

export type { ChatMessage, ChatStatus, PeerInfo } from "@tunecamp/chat";

export function usePeerChat(enabled: boolean, activePeer: string) {
	const token =
		localStorage.getItem("tunecamp_token") ||
		localStorage.getItem("token") ||
		undefined;
	const serverUrl = window.location.origin;

	const chat = useTuneCampChat(
		{
			serverUrl,
			token,
			autoConnect: enabled,
		},
		activePeer,
	);

	return {
		...chat,
		formatUser: (user: string, instance?: string) =>
			formatUsernameWithInstance(user, instance || chat.client?.getInstanceName()),
	};
}
