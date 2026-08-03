import { useTuneCampChat, formatUsernameWithInstance } from "@tunecamp/chat";
import { useAuthStore } from "../stores/useAuthStore";

export type { ChatMessage, PeerInfo } from "@tunecamp/chat";

export function usePeerChat(enabled: boolean, activePeer: string) {
	const token =
		localStorage.getItem("tunecamp_token") ||
		localStorage.getItem("token") ||
		undefined;
	const serverUrl = window.location.origin;
	const chatKeyPair = useAuthStore((s) => s.chatKeyPair);

	const chat = useTuneCampChat(
		{
			serverUrl,
			token,
			autoConnect: enabled,
			keyPair: chatKeyPair ?? undefined,
		},
		activePeer,
	);

	return {
		...chat,
		formatUser: (user: string, instance?: string) =>
			formatUsernameWithInstance(user, instance || chat.client?.getInstanceName()),
	};
}
