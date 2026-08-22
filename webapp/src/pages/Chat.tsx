import { useState, useEffect, useRef, useCallback } from "react";
import {
	usePeerChat,
	type ChatMessage,
	type PeerInfo,
	type RoomInfo,
} from "../hooks/usePeerChat";
import { PageHeader } from "../components/ui/PageHeader";
import { useSiteSettingsStore, truthy } from "../stores/useSiteSettingsStore";
import { useAuthStore } from "../stores/useAuthStore";
import { UnlockRoomModal } from "../components/modals/UnlockRoomModal";
import {
	MessageCircle,
	Send,
	Lock,
	Key,
	Unlock,
	ShieldCheck,
	AlertCircle,
	Globe,
	ChevronDown,
	Users,
	Hash,
	Plus,
	LogOut,
	ShieldAlert,
	UserX,
	VolumeX,
	Trash2,
	HelpCircle,
} from "lucide-react";
import clsx from "clsx";

const formatTime = (ts: number) =>
	new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat() {
	const { settings: siteSettings, fetchFlags } = useSiteSettingsStore();
	const { role, user } = useAuthStore();
	const roleStr = String(role || "");
	const isSiteAdmin =
		roleStr === "admin" ||
		roleStr === "root_admin" ||
		roleStr === "super_user" ||
		roleStr === "manager";
	const [to, setTo] = useState("");
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [activeRoomId, setActiveRoomId] = useState<number | undefined>();
	const [newRoomName, setNewRoomName] = useState("");
	const [newRoomPrivate, setNewRoomPrivate] = useState(false);
	const [newRoomEncrypted, setNewRoomEncrypted] = useState(false);
	const [newRoomPassphrase, setNewRoomPassphrase] = useState("");
	const [showRoomForm, setShowRoomForm] = useState(false);
	const [showScrollBtn, setShowScrollBtn] = useState(false);
	const [unlockModalRoom, setUnlockModalRoom] = useState<RoomInfo | null>(null);
	const [showUnlockModal, setShowUnlockModal] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		fetchFlags();
	}, [fetchFlags]);

	const isChatEnabled = truthy(siteSettings?.peerChatEnabled);
	const {
		messages,
		status,
		username,
		isAdmin,
		peers,
		rooms,
		createRoom,
		deleteRoom,
		leaveRoom,
		sendRoomMessage,
		roomUnreadCounts,
		clearRoomUnread,
		roomPassphrases,
		setRoomPassphrase,
		clearRoomPassphrase,
		keyChanges,
		acceptKeyChange,
		unreadCounts,
		clearUnread,
		sendMessage,
		sendAdminAction,
		formatUser,
		client,
	} = usePeerChat(isChatEnabled, to, activeRoomId);

	const activeRoom = rooms.find((r: RoomInfo) => r.id === activeRoomId);

	const peerTarget = (peer: PeerInfo) => {
		if (!peer.instance || peer.instance === client?.getInstanceName()) {
			return peer.username;
		}
		return `${peer.username}@${peer.instance}`;
	};

	const isActivePeer = (peer: PeerInfo) => {
		return to === peer.username || to === peerTarget(peer);
	};

	const canModerate = isSiteAdmin || isAdmin;
	const currentUsername = username || user?.username || "";
	const canDeleteRoom = (room: RoomInfo) =>
		canModerate ||
		(Boolean(room.created_by) &&
			Boolean(currentUsername) &&
			room.created_by?.toLowerCase() === currentUsername.toLowerCase());

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

	// sendMessage is async and refuses a DM it can't encrypt, so the draft is
	// only cleared once the message is actually on the wire — otherwise the
	// user loses what they wrote to a "message not sent" they can't retry.
	const handleSend = async () => {
		const target = to.trim();
		const body = text.trim();
		if (!body || sending) return;
		setSending(true);
		try {
			if (activeRoomId) {
				if (sendRoomMessage(activeRoomId, body)) setText("");
			} else if (await sendMessage(target, body)) {
				setText("");
			}
		} finally {
			setSending(false);
		}
	};

	// Lobby, a room and a DM are three different destinations for the same
	// composer, so selecting one has to clear the other two.
	const selectLobby = () => {
		setTo("");
		setActiveRoomId(undefined);
	};

	const selectRoom = (room: RoomInfo) => {
		setTo("");
		setActiveRoomId(room.id);
		clearRoomUnread(room.id);
	};

	const selectPeer = (target: string) => {
		setActiveRoomId(undefined);
		setTo(target);
	};

	const handleCreateRoom = async () => {
		const name = newRoomName.trim();
		if (!name) return;
		try {
			const room = await createRoom(name, undefined, newRoomPrivate);
			if (room) {
				if (newRoomEncrypted && newRoomPassphrase.trim()) {
					setRoomPassphrase(room.id, newRoomPassphrase.trim());
				}
				setNewRoomName("");
				setNewRoomPrivate(false);
				setNewRoomEncrypted(false);
				setNewRoomPassphrase("");
				setShowRoomForm(false);
				selectRoom(room);
			} else {
				alert("Impossibile creare la stanza. Assicurati di aver effettuato l'accesso.");
			}
		} catch (err: any) {
			alert(err?.message || "Errore durante la creazione della stanza.");
		}
	};

	const handleLeaveRoom = async (room: RoomInfo) => {
		await leaveRoom(room.id);
		if (activeRoomId === room.id) setActiveRoomId(undefined);
	};

	const handleDeleteRoom = async (room: RoomInfo) => {
		if (!confirm(`Delete "${room.name}" and its history for everyone?`)) return;
		await deleteRoom(room.id);
		if (activeRoomId === room.id) setActiveRoomId(undefined);
	};

	const pendingKeyChange = to.trim() ? keyChanges[to.trim()] : undefined;

	const handleAcceptKeyChange = (peerId: string) => {
		const change = keyChanges[peerId];
		if (!change) return;
		const confirmed = confirm(
			`Accept ${peerId}'s new encryption key?\n\n` +
				`Pinned:  ${change.pinned}\n` +
				`Offered: ${change.offered}\n\n` +
				`Only accept if ${peerId} confirmed this fingerprint over a channel this server does not control. ` +
				`A key swapped by the server looks exactly the same from here.`,
		);
		if (confirmed) acceptKeyChange(peerId);
	};

	const handleAdminAction = (action: string, targetUser: string) => {
		if (action === "kick") {
			const reason = prompt(`Reason for kicking ${targetUser}?`);
			if (reason !== null)
				sendAdminAction("kick", targetUser, reason || undefined);
		} else if (action === "ban") {
			const reason = prompt(`Reason for banning ${targetUser}?`);
			if (reason !== null)
				sendAdminAction("ban", targetUser, reason || undefined);
		} else if (action === "mute") {
			const minutes = prompt(`Mute ${targetUser} for how many minutes?`, "15");
			if (minutes !== null) {
				const duration = parseInt(minutes, 10) || 15;
				const reason = prompt(`Reason for muting ${targetUser}?`);
				sendAdminAction("mute", targetUser, reason || undefined, duration);
			}
		}
	};

	if (!siteSettings) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 opacity-50">
				<span className="loading loading-spinner loading-lg text-primary"></span>
				<p className="text-sm font-medium">Loading chat...</p>
			</div>
		);
	}

	if (!isChatEnabled && !canModerate) {
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
					activeRoom
						? `Room · ${activeRoom.name}`
						: to
							? `Direct message to ${to}`
							: "Talk to everyone in the lobby"
				}
				icon={MessageCircle}
				iconColor="text-primary"
				gradientFrom="from-primary/20"
				gradientTo="to-primary/5"
			/>

			{!isChatEnabled && canModerate && (
				<div className="alert alert-warning py-3 rounded-2xl shadow-m3-1 flex items-center gap-3">
					<AlertCircle size={20} className="shrink-0" />
					<div className="text-xs font-semibold">
						Peer chat is disabled for this instance. Only you can see this page.
					</div>
				</div>
			)}

			<div className="flex items-center justify-between gap-3 text-xs">
				<div className="flex items-center gap-3">
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
						<span className="opacity-60">
							connected as{" "}
							<strong className="text-base-content">{username}</strong>
						</span>
					)}
					{canModerate && (
						<span className="badge badge-sm badge-outline badge-secondary font-mono">
							🛡️ Admin Mode
						</span>
					)}
				</div>
				{canModerate && (
					<button
						onClick={() => {
							if (confirm("Clear all chat history for everyone?")) {
								sendAdminAction("clear");
							}
						}}
						className="btn btn-xs btn-ghost text-error gap-1 hover:bg-error/10"
						title="Clear lobby chat history"
					>
						<Trash2 size={12} /> Clear Chat
					</button>
				)}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
				<div className="bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect overflow-hidden flex flex-col">
					{activeRoom && (
						<div className="px-4 py-2.5 bg-base-300/40 border-b border-base-content/5 flex items-center justify-between gap-3 text-xs">
							<div className="flex items-center gap-2 min-w-0">
								<Hash size={16} className="text-primary shrink-0" />
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-bold text-sm text-base-content truncate">
											{activeRoom.name}
										</span>
										{roomPassphrases[activeRoom.id] ? (
											<span className="badge badge-xs badge-accent gap-1 font-semibold">
												<ShieldCheck size={10} /> E2EE Attiva
											</span>
										) : activeRoom.is_private ? (
											<span className="badge badge-xs badge-outline gap-1 opacity-70">
												<Lock size={10} /> Privata
											</span>
										) : (
											<span className="badge badge-xs badge-ghost gap-1 opacity-70">
												<Globe size={10} /> Pubblica
											</span>
										)}
									</div>
									{activeRoom.description && (
										<p className="text-[11px] opacity-60 truncate">
											{activeRoom.description}
										</p>
									)}
								</div>
							</div>
							<div className="flex items-center gap-1.5 shrink-0">
								<span className="text-[11px] opacity-50 mr-1 hidden sm:inline">
									{activeRoom.member_count} {activeRoom.member_count === 1 ? "membro" : "membri"}
								</span>
								<button
									onClick={() => {
										setUnlockModalRoom(activeRoom);
										setShowUnlockModal(true);
									}}
									className={clsx(
										"btn btn-xs gap-1 rounded-lg",
										roomPassphrases[activeRoom.id]
											? "btn-ghost text-accent hover:bg-accent/10"
											: "btn-outline btn-warning",
									)}
									title={
										roomPassphrases[activeRoom.id]
											? "Modifica o dimentica passphrase E2EE"
											: "Sblocca stanza con passphrase"
									}
								>
									{roomPassphrases[activeRoom.id] ? (
										<>
											<ShieldCheck size={12} />
											<span className="hidden sm:inline">E2EE</span>
										</>
									) : (
										<>
											<Key size={12} />
											<span className="hidden sm:inline">Sblocca E2EE</span>
										</>
									)}
								</button>
								<button
									onClick={() => handleLeaveRoom(activeRoom)}
									className="btn btn-xs btn-ghost gap-1 opacity-70 hover:opacity-100"
									title={`Leave ${activeRoom.name}`}
								>
									<LogOut size={12} />
									<span className="hidden sm:inline">Esci</span>
								</button>
								{canDeleteRoom(activeRoom) && (
									<button
										onClick={() => handleDeleteRoom(activeRoom)}
										className="btn btn-xs btn-error btn-outline gap-1"
										title={`Delete ${activeRoom.name}`}
									>
										<Trash2 size={12} />
										<span className="hidden sm:inline">Elimina stanza</span>
									</button>
								)}
							</div>
						</div>
					)}
					<div
						ref={scrollContainerRef}
						className="h-[55vh] overflow-y-auto p-4 space-y-3"
					>
						{activeRoom && !roomPassphrases[activeRoom.id] && messages.some((m: ChatMessage) => m.isEncrypted || (m.text && m.text.includes("[Messaggio cifrato"))) && (
							<div className="alert alert-warning py-2 px-3 rounded-2xl flex items-center justify-between gap-2 text-xs shadow-xs">
								<div className="flex items-center gap-2 min-w-0">
									<Key size={14} className="text-warning shrink-0" />
									<span className="truncate">Questa stanza contiene messaggi cifrati con Passphrase.</span>
								</div>
								<button
									type="button"
									className="btn btn-xs btn-warning rounded-xl shrink-0 gap-1 font-bold"
									onClick={() => {
										setUnlockModalRoom(activeRoom);
										setShowUnlockModal(true);
									}}
								>
									<Unlock size={12} /> Sblocca
								</button>
							</div>
						)}
						{messages.length === 0 && (
							<div className="text-center py-12 space-y-2">
								<MessageCircle size={32} className="opacity-20 mx-auto" />
								<p className="text-sm opacity-50">Nothing here yet.</p>
								<p className="text-xs opacity-40">
									{activeRoom
										? `Be the first to say something in ${activeRoom.name}.`
										: to
											? `Start an encrypted conversation with ${to}.`
											: "Say hello to the lobby, pick a room, or select a peer for a direct message."}
								</p>
							</div>
						)}
						{messages.map((m: ChatMessage, i: number) => {
							if (m.system) {
								return (
									<div
										key={`${m.ts}-${i}`}
										className="flex flex-col items-center my-1.5"
									>
										<div className="bg-base-300/80 border border-base-content/10 text-[11px] px-3 py-1 rounded-full text-base-content/70 font-mono shadow-xs flex items-center gap-1.5">
											<ShieldAlert
												size={12}
												className="text-warning shrink-0"
											/>
											<span>{m.text}</span>
											<span className="opacity-40 text-[9px] ml-1">
												{formatTime(m.ts)}
											</span>
										</div>
									</div>
								);
							}
							const isSelf = m.self;
							const label = isSelf ? "You" : formatUser(m.from, m.instance);
							const align = isSelf ? "items-end" : "items-start";
							const bubble = isSelf
								? "bg-primary text-primary-content"
								: "bg-base-100/80";
							return (
								<div
									key={`${m.ts}-${i}`}
									className={clsx("flex flex-col group", align)}
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
										) : m.isEncrypted ? (
											<Key
												size={10}
												className="text-warning"
												aria-label="Cifrato"
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

					<div className="border-t border-base-content/5 p-3 flex flex-col gap-2">
						{pendingKeyChange && (
							<div className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 text-xs space-y-2">
								<div className="flex items-start gap-2">
									<ShieldAlert size={14} className="text-warning shrink-0 mt-0.5" />
									<div className="space-y-1">
										<p className="font-semibold">
											{pendingKeyChange.peerId}'s encryption key changed.
										</p>
										<p className="opacity-70">
											Messages stay blocked until you accept it. Ask them for
											their fingerprint somewhere this server can't reach — a
											swapped key looks identical from here.
										</p>
										<p className="font-mono opacity-80 break-all">
											pinned&nbsp;&nbsp;{pendingKeyChange.pinned}
											<br />
											offered&nbsp;{pendingKeyChange.offered}
										</p>
									</div>
								</div>
								<button
									className="btn btn-xs btn-warning rounded-lg gap-1"
									onClick={() => handleAcceptKeyChange(pendingKeyChange.peerId)}
								>
									Accept new key
								</button>
							</div>
						)}
						{text.startsWith("/") && (
							<div className="bg-base-300/80 border border-base-content/10 rounded-xl px-3 py-2 text-xs text-base-content/70 font-mono flex items-center gap-2">
								<HelpCircle size={14} className="text-info shrink-0" />
								<span>
									Commands: <code>/kick &lt;user&gt; [reason]</code> |{" "}
									<code>/ban &lt;user&gt; [reason]</code> |{" "}
									<code>/mute &lt;user&gt; [min]</code> | <code>/unban</code> |{" "}
									<code>/unmute</code> | <code>/clear</code>
								</span>
							</div>
						)}
						<div className="flex flex-col sm:flex-row gap-2">
							{activeRoom ? (
								<div className="flex items-center gap-1 text-xs font-semibold text-primary sm:w-48 px-1 truncate">
									<Hash size={12} className="shrink-0" />
									<span className="truncate">{activeRoom.name}</span>
								</div>
							) : (
								<input
									className="input input-sm input-bordered rounded-xl sm:w-48"
									value={to}
									onChange={(e) => setTo(e.target.value)}
									placeholder="Peer username (empty = lobby)"
								/>
							)}
							<input
								className="input input-sm input-bordered rounded-xl flex-1 font-sans"
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
									status !== "online"
										? "Connecting..."
										: activeRoom
											? `Message #${activeRoom.name}...`
											: to
												? "Encrypted message..."
												: "Message or /command..."
								}
								disabled={status !== "online"}
							/>
							<button
								className="btn btn-sm btn-primary rounded-xl gap-2"
								onClick={handleSend}
								disabled={status !== "online" || !text.trim() || sending}
							>
								<Send size={14} /> Send
							</button>
						</div>
					</div>
				</div>

				<div className="bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect p-3">
					<div className="space-y-1 max-h-[60vh] overflow-y-auto">
						{/* Explicit Lobby Option */}
						<div
							className={clsx(
								"group w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors",
								to === "" && !activeRoomId
									? "bg-primary/10 text-primary font-bold"
									: "hover:bg-base-content/5",
							)}
							onClick={selectLobby}
						>
							<div className="flex items-center gap-2 min-w-0 flex-1">
								<Globe
									size={14}
									className={
										to === "" && !activeRoomId ? "text-primary" : "opacity-60"
									}
								/>
								<span className="truncate">🌐 Public Lobby</span>
							</div>
						</div>

						<div className="flex items-center justify-between text-xs font-semibold opacity-60 mt-3 mb-1 px-1">
							<div className="flex items-center gap-2">
								<Hash size={14} />
								Rooms ({rooms.length})
							</div>
							<button
								className="btn btn-ghost btn-xs btn-square"
								onClick={() => setShowRoomForm((v) => !v)}
								title="New room"
								aria-label="New room"
							>
								<Plus size={12} />
							</button>
						</div>

						{showRoomForm && (
							<div className="space-y-2 p-2 bg-base-300/40 rounded-xl border border-base-content/5">
								<input
									className="input input-xs input-bordered rounded-lg w-full"
									value={newRoomName}
									onChange={(e) => setNewRoomName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											handleCreateRoom();
										}
									}}
									maxLength={64}
									placeholder="Room name..."
									aria-label="Room name"
								/>
								<label className="flex items-center gap-1.5 text-[11px] opacity-70 px-1 cursor-pointer">
									<input
										type="checkbox"
										className="checkbox checkbox-xs"
										checked={newRoomPrivate}
										onChange={(e) => setNewRoomPrivate(e.target.checked)}
									/>
									Local to this instance
								</label>
								<label className="flex items-center gap-1.5 text-[11px] opacity-80 px-1 cursor-pointer">
									<input
										type="checkbox"
										className="checkbox checkbox-xs checkbox-accent"
										checked={newRoomEncrypted}
										onChange={(e) => setNewRoomEncrypted(e.target.checked)}
									/>
									<span className="flex items-center gap-1 text-accent font-semibold">
										<Key size={11} /> Encrypt with Passphrase (E2EE)
									</span>
								</label>
								{newRoomEncrypted && (
									<input
										type="password"
										className="input input-xs input-bordered rounded-lg w-full font-mono text-xs"
										value={newRoomPassphrase}
										onChange={(e) => setNewRoomPassphrase(e.target.value)}
										placeholder="Encryption passphrase..."
										aria-label="Encryption passphrase"
									/>
								)}
								<button
									className="btn btn-xs btn-primary rounded-lg w-full"
									onClick={handleCreateRoom}
									disabled={!newRoomName.trim() || (newRoomEncrypted && !newRoomPassphrase.trim())}
								>
									Create Room
								</button>
							</div>
						)}

						{rooms.length === 0 && (
							<p className="text-xs opacity-40 px-1 pb-1">No rooms yet.</p>
						)}
						{rooms.map((room: RoomInfo) => {
							const isActive = activeRoomId === room.id;
							const unread = roomUnreadCounts[room.id] || 0;
							const isUnlocked = Boolean(roomPassphrases[room.id]);
							return (
								<div
									key={room.id}
									className={clsx(
										"group w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors",
										isActive
											? "bg-primary/10 text-primary"
											: "hover:bg-base-content/5",
									)}
								>
									<button
										className="flex items-center gap-2 min-w-0 flex-1 text-left"
										onClick={() => selectRoom(room)}
									>
										{isUnlocked ? (
											<ShieldCheck size={14} className="text-accent shrink-0" />
										) : room.is_private ? (
											<Lock
												size={14}
												className="opacity-50 shrink-0"
												aria-label="Local to this instance"
											/>
										) : (
											<Hash size={14} className={clsx("shrink-0", isActive ? "" : "opacity-60")} />
										)}
										<span className="truncate font-medium">{room.name}</span>
										{isUnlocked && (
											<span className="badge badge-xs badge-accent text-[9px] px-1 py-0 font-bold shrink-0">
												E2EE
											</span>
										)}
										<span className="opacity-40 text-[10px] shrink-0">
											{room.member_count}
										</span>
									</button>
									{unread > 0 && !isActive && (
										<span className="badge badge-sm badge-error text-white font-bold shrink-0">
											{unread}
										</span>
									)}
									<div className="flex items-center gap-1 shrink-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
										<button
											onClick={(e) => {
												e.stopPropagation();
												setUnlockModalRoom(room);
												setShowUnlockModal(true);
											}}
											className={clsx(
												"btn btn-ghost btn-xs btn-square",
												isUnlocked ? "text-accent" : "opacity-70 hover:opacity-100",
											)}
											title={isUnlocked ? "Stanza E2EE sbloccata" : "Sblocca stanza con Passphrase"}
											aria-label="Gestisci Passphrase E2EE"
										>
											<Key size={12} />
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleLeaveRoom(room);
											}}
											className="btn btn-ghost btn-xs btn-square opacity-70 hover:opacity-100"
											title={`Leave ${room.name}`}
											aria-label={`Leave ${room.name}`}
										>
											<LogOut size={12} />
										</button>
										{canDeleteRoom(room) && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteRoom(room);
												}}
												className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
												title={`Delete ${room.name}`}
												aria-label={`Delete ${room.name}`}
											>
												<Trash2 size={12} />
											</button>
										)}
									</div>
								</div>
							);
						})}

						<div className="flex items-center gap-2 text-xs font-semibold opacity-60 mt-3 mb-1 px-1">
							<Users size={14} />
							Connected ({peers.length})
						</div>

						{peers.length === 0 && (
							<p className="text-xs opacity-40 px-1 pt-2">
								No other peers connected.
							</p>
						)}
						{peers.map((peer: PeerInfo) => {
							const isSelf = peer.username === username;
							const unread = unreadCounts[peer.username] || 0;
							return (
								<div
									key={peer.username}
									className={clsx(
										"group w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors",
										isActivePeer(peer)
											? "bg-primary/10 text-primary"
											: "hover:bg-base-content/5",
									)}
								>
									<button
										className="flex items-center gap-2 min-w-0 flex-1 text-left"
										onClick={() => {
											if (isSelf) {
												selectLobby();
											} else {
												selectPeer(peerTarget(peer));
												clearUnread(peer.username);
											}
										}}
									>
										<span
											className="w-2 h-2 rounded-full bg-success shrink-0"
											aria-label="Online"
										/>
										<span className="truncate text-left font-medium">
											{formatUser(peer.username, peer.instance)}
										</span>
										{isSelf && (
											<span className="opacity-40 text-[10px]">you</span>
										)}
										{keyChanges[peerTarget(peer)] ? (
											<ShieldAlert
												size={10}
												className="text-warning shrink-0"
												aria-label="Key changed — messages blocked"
											/>
										) : (
											peer.pubkey && (
												<Lock
													size={10}
													className="text-success shrink-0"
													aria-label="E2E ready"
												/>
											)
										)}
									</button>
									{unread > 0 && !isActivePeer(peer) && (
										<span className="badge badge-sm badge-error text-white font-bold shrink-0">
											{unread}
										</span>
									)}
									{canModerate && !isSelf && (
										<div className="hidden group-hover:flex items-center gap-1 shrink-0">
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleAdminAction("kick", peer.username);
												}}
												className="btn btn-ghost btn-xs btn-square text-warning"
												title={`Kick ${peer.username}`}
											>
												<UserX size={12} />
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleAdminAction("mute", peer.username);
												}}
												className="btn btn-ghost btn-xs btn-square opacity-70 hover:opacity-100"
												title={`Mute ${peer.username}`}
											>
												<VolumeX size={12} />
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleAdminAction("ban", peer.username);
												}}
												className="btn btn-ghost btn-xs btn-square text-error"
												title={`Ban ${peer.username}`}
											>
												<ShieldAlert size={12} />
											</button>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<p className="text-xs opacity-50">
				{activeRoom
					? activeRoom.is_private
						? "Room messages are stored on this instance and stay on it. Anyone here can join this room."
						: "Room messages are stored on this instance and relayed to federated peers. Anyone here can join this room."
					: to
						? "Messages are end-to-end encrypted and never stored on the server."
						: "Lobby messages are visible to everyone connected. Type /help for slash commands."}
			</p>

			<UnlockRoomModal
				isOpen={showUnlockModal}
				onClose={() => setShowUnlockModal(false)}
				room={unlockModalRoom}
				currentPassphrase={unlockModalRoom ? roomPassphrases[unlockModalRoom.id] || "" : ""}
				onSavePassphrase={setRoomPassphrase}
				onClearPassphrase={clearRoomPassphrase}
			/>
		</div>
	);
}
