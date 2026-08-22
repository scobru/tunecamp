import { useState, useEffect } from "react";
import { Lock, Key, Unlock, Trash2, X, ShieldCheck } from "lucide-react";
import type { RoomInfo } from "@tunecamp/chat";

interface UnlockRoomModalProps {
	isOpen: boolean;
	onClose: () => void;
	room: RoomInfo | null;
	currentPassphrase?: string;
	onSavePassphrase: (roomId: number, passphrase: string) => void;
	onClearPassphrase: (roomId: number) => void;
}

export const UnlockRoomModal = ({
	isOpen,
	onClose,
	room,
	currentPassphrase = "",
	onSavePassphrase,
	onClearPassphrase,
}: UnlockRoomModalProps) => {
	const [passphrase, setPassphrase] = useState(currentPassphrase);
	const [showPass, setShowPass] = useState(false);

	useEffect(() => {
		setPassphrase(currentPassphrase);
	}, [currentPassphrase, room?.id]);

	if (!isOpen || !room) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!passphrase.trim()) return;
		onSavePassphrase(room.id, passphrase.trim());
		onClose();
	};

	const handleForget = () => {
		onClearPassphrase(room.id);
		setPassphrase("");
		onClose();
	};

	const isUnlocked = Boolean(currentPassphrase);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
			<div
				className="bg-base-200 border border-base-content/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative space-y-5 glass-effect"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-primary font-bold text-lg">
						<Lock size={20} className="text-accent" />
						<span>Cifratura Stanza #{room.name}</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="btn btn-sm btn-circle btn-ghost opacity-70 hover:opacity-100"
						aria-label="Chiudi"
					>
						<X size={16} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="p-3.5 bg-base-300/60 border border-base-content/5 rounded-2xl text-xs space-y-2">
						{isUnlocked ? (
							<div className="flex items-center gap-2 text-accent font-semibold">
								<ShieldCheck size={16} className="shrink-0" />
								<span>Stanza sbloccata su questo dispositivo. I messaggi vengono decifrati in tempo reale con Zen SEA.</span>
							</div>
						) : (
							<div className="flex items-center gap-2 text-base-content/80">
								<Key size={16} className="text-primary shrink-0" />
								<span>Inserisci la passphrase condivisa per decifrare lo storico e inviare messaggi cifrati E2EE in questa stanza.</span>
							</div>
						)}
					</div>

					<div className="space-y-1.5">
						<label className="block text-xs font-semibold text-base-content/70">
							Passphrase di Cifratura
						</label>
						<div className="relative">
							<input
								type={showPass ? "text" : "password"}
								className="input input-bordered input-sm w-full rounded-xl pr-20 font-mono text-sm"
								placeholder="Passphrase della stanza..."
								value={passphrase}
								onChange={(e) => setPassphrase(e.target.value)}
								autoFocus
								required
							/>
							<button
								type="button"
								onClick={() => setShowPass(!showPass)}
								className="btn btn-xs btn-ghost absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] opacity-70 hover:opacity-100"
							>
								{showPass ? "Nascondi" : "Mostra"}
							</button>
						</div>
						<p className="text-[11px] opacity-50">
							La chiave viene derivata localmente (PBKDF2 a 100.000 iterazioni) e non viene mai inviata al server.
						</p>
					</div>

					<div className="flex items-center justify-between pt-2">
						{isUnlocked ? (
							<button
								type="button"
								className="btn btn-sm btn-ghost text-error gap-1.5 hover:bg-error/10 rounded-xl"
								onClick={handleForget}
							>
								<Trash2 size={14} /> Dimentica
							</button>
						) : (
							<button
								type="button"
								className="btn btn-sm btn-ghost rounded-xl"
								onClick={onClose}
							>
								Annulla
							</button>
						)}

						<button
							type="submit"
							className="btn btn-sm btn-primary rounded-xl gap-1.5"
							disabled={!passphrase.trim()}
						>
							<Unlock size={14} /> {isUnlocked ? "Aggiorna Passphrase" : "Sblocca Stanza"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
