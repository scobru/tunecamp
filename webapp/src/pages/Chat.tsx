import { useState, useEffect, useRef, useCallback } from "react";
import { usePeerChat } from "../hooks/usePeerChat";
import { PageHeader } from "../components/ui/PageHeader";
import { useSiteSettingsStore, truthy } from "../stores/useSiteSettingsStore";
import { useAuthStore } from "../stores/useAuthStore";
import {
	MessageCircle,
	Send,
	Lock,
	AlertCircle,
	Globe,
	ChevronDown,
	Users,
} from "lucide-react";
import clsx from "clsx";

const formatTime = (ts: number) =>
	new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat() {
	const { settings: siteSettings, fetchFlags } = useSiteSettingsStore();
	const { role } = useAuthStore();
	const isAdmin =
		role === "admin" || role === "root_admin" || role === "super_user";
	const [to, setTo] = useState("");
	const [text, setText] = useState("");
	const [showScrollBtn, setShowScrollBtn] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		fetchFlags();
	}, [fetchFlags]);

	const isChatEnabled = truthy(siteSettings?.peerChatEnabled);
	const { messages, status, username, peers, sendMessage } = usePeerChat(
		isChatEnabled,
		to,
	);

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		bottomRef.current?.scrollIntoView({ behavior });
	}, []);

	useEffect(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const onScroll = () =>
			setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
		el.addEventListener("scroll", onScroll);
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		if (messages.length > 0) {
			scrollToBottom();
		}
	}, [messages.length, scrollToBottom]);

	const handleSend = () => {
		if (!sendMessage(to.trim(), text.trim())) return;
		setText("");
	};

	if (!siteSettings) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 opacity-50">
				<span className="loading loading-spinner loading-lg text-primary"></span>
				<p className="text-sm font-medium">Loading chat...</p>
			</div>
		);
	}

	if (!isChatEnabled && !isAdmin) {
		return (
			<div className="max-w-md mx-auto my-16 p-8 text-center bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect space-y-4">
				<div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto">
					<AlertCircle size={32} />
				</div>
				<h2 className="text-xl font-bold">Chat Disabled</h2>
				<p className="text-sm opacity-60">
					Peer chat is currently disabled by the site administrator.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-8 animate-fade-in pb-12">
			<PageHeader
				title="Peer Chat"
				subtitle={
					to ? `Direct message to ${to}` : "Talk to everyone in the lobby"
				}
				icon={MessageCircle}
				iconColor="text-primary"
				gradientFrom="from-primary/20"
				gradientTo="to-primary/5"
			/>

			{!isChatEnabled && isAdmin && (
				<div className="alert alert-warning py-3 rounded-2xl shadow-m3-1 flex items-center gap-3">
					<AlertCircle size={20} className="shrink-0" />
					<div className="text-xs font-semibold">
						Peer chat is disabled for this instance. Only you can see this page.
					</div>
				</div>
			)}

			<div className="flex items-center gap-3 text-xs">
				<span
					className={clsx("badge badge-sm gap-1", {
						"badge-success": status === "online",
						"badge-warning": status === "connecting",
						"badge-ghost": status === "offline",
					})}
				>
					{status}
				</span>
				{username && (
					<span className="opacity-60">connected as {username}</span>
				)}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
				<div className="bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect overflow-hidden">
					<div
						ref={scrollContainerRef}
						className="h-[55vh] overflow-y-auto p-4 space-y-3"
					>
						{messages.length === 0 && (
							<div className="text-center py-12 space-y-2">
								<MessageCircle size={32} className="opacity-20 mx-auto" />
								<p className="text-sm opacity-50">Nothing here yet.</p>
								<p className="text-xs opacity-40">
									{to
										? `Start an encrypted conversation with ${to}.`
										: "Say hello to the lobby, or select a peer for a direct message."}
								</p>
							</div>
						)}
						{messages.map((m, i) => {
							const isSelf = m.self;
							const label = isSelf ? "You" : m.from;
							const align = isSelf ? "items-end" : "items-start";
							const bubble = isSelf
								? "bg-primary text-primary-content"
								: "bg-base-100/80";
							return (
								<div
									key={`${m.ts}-${i}`}
									className={clsx("flex flex-col", align)}
								>
									<div className="flex items-baseline gap-2 text-xs mb-1 px-1">
										<span className="font-semibold">{label}</span>
										<span className="opacity-40">{formatTime(m.ts)}</span>
										{m.e2e ? (
											<Lock
												size={10}
												className="text-success"
												aria-label="E2E"
											/>
										) : (
											<Globe
												size={10}
												className="opacity-30"
												aria-label="Lobby"
											/>
										)}
									</div>
									<div
										className={clsx(
											"max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm break-words shadow-sm",
											bubble,
										)}
									>
										{m.text}
									</div>
								</div>
							);
						})}
						<div ref={bottomRef} />
					</div>

					{showScrollBtn && (
						<div className="px-4 pb-2 -mt-2">
							<button
								className="btn btn-xs btn-ghost rounded-lg gap-1 opacity-80 hover:opacity-100"
								onClick={() => scrollToBottom()}
							>
								<ChevronDown size={14} /> Latest
							</button>
						</div>
					)}

					<div className="border-t border-base-content/5 p-3 flex flex-col sm:flex-row gap-2">
						<input
							className="input input-sm input-bordered rounded-xl sm:w-48"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							placeholder="Peer username (empty = lobby)"
						/>
						<input
							className="input input-sm input-bordered rounded-xl flex-1"
							value={text}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSend();
								}
							}}
							maxLength={2000}
							placeholder={
								status === "online"
									? to
										? "Encrypted message..."
										: "Message..."
									: "Connecting..."
							}
							disabled={status !== "online"}
						/>
						<button
							className="btn btn-sm btn-primary rounded-xl gap-2"
							onClick={handleSend}
							disabled={status !== "online" || !text.trim()}
						>
							<Send size={14} /> Send
						</button>
					</div>
				</div>

				<div className="bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect p-3">
					<div className="flex items-center gap-2 text-xs font-semibold opacity-60 mb-2 px-1">
						<Users size={14} />
						Connected ({peers.length})
					</div>
					<div className="space-y-1 max-h-[50vh] overflow-y-auto">
						{peers.length === 0 && (
							<p className="text-xs opacity-40 px-1">No peers connected yet.</p>
						)}
						{peers.map((peer) => {
							const isSelf = peer.username === username;
							return (
								<button
									key={peer.username}
									className={clsx(
										"w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
										to === peer.username
											? "bg-primary/10 text-primary"
											: "hover:bg-base-content/5",
									)}
									onClick={() => setTo(isSelf ? "" : peer.username)}
								>
									<span
										className="w-2 h-2 rounded-full bg-success shrink-0"
										aria-label="Online"
									/>
									<span className="truncate flex-1 text-left">
										{peer.username}
									</span>
									{isSelf && <span className="opacity-40">you</span>}
									{peer.pubkey && (
										<Lock
											size={10}
											className="text-success"
											aria-label="E2E ready"
										/>
									)}
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<p className="text-xs opacity-50">
				{to
					? "Messages are end-to-end encrypted and never stored on the server."
					: "Lobby messages are visible to everyone connected. Direct messages are end-to-end encrypted and never stored."}
			</p>
		</div>
	);
}
