import { useState, useEffect, useRef } from "react";
import {
    Sparkles,
    Send,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Cpu,
    Trash2,
    Wrench,
    Check
} from "lucide-react";
import API from "../../services/api";
import type {
    AiChatMessage,
    AiContext,
    AiProposal,
    AiProposedAction
} from "../../services/api/admin";
import { useConfigStore } from "../../stores/useConfigStore";
import { notify } from "../../utils/notify";

interface UiMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolTrace?: Array<{ name: string; summary: string }>;
    proposal?: AiProposal;
    appliedCount?: number;
}

interface AiAssistantBoxProps {
    context?: AiContext;
    contextSummary?: string;
    suggestedPrompts?: string[];
    onApplied?: () => void;
    compact?: boolean;
}

const DEFAULT_MAINTENANCE_PROMPTS = [
    "Trova tracce con titoli generici (AudioTrack / Track 01)",
    "Quali album non hanno la copertina?",
    "Mostra statistiche libreria"
];

const DEFAULT_CONTEXT_PROMPTS = [
    "Trova i titoli giusti delle tracce di questo album",
    "Completa genere, anno e copertina"
];

export const AiAssistantBox = ({
    context,
    contextSummary,
    suggestedPrompts,
    onApplied,
    compact = false
}: AiAssistantBoxProps) => {
    const [messages, setMessages] = useState<UiMessage[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [applyingProposalId, setApplyingProposalId] = useState<string | null>(null);
    const [selectedActionIds, setSelectedActionIds] = useState<Record<string, string[]>>({});
    const [error, setError] = useState<string | null>(null);

    const status = useConfigStore(s => s.status);
    const hasConfigAI = useConfigStore(s => s.isConfigured("openrouter"));
    const [fallbackStatus, setFallbackStatus] = useState<{ configured: boolean; model: string } | null>(null);
    const [checkedStatus, setCheckedStatus] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (status?.openrouter) {
            setCheckedStatus(true);
            return;
        }
        let cancelled = false;
        API.aiStatus()
            .then(res => {
                if (!cancelled) setFallbackStatus(res);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setCheckedStatus(true);
            });
        return () => { cancelled = true; };
    }, [status]);

    const hasAI = status?.openrouter ? hasConfigAI : (fallbackStatus?.configured ?? false);
    const activeModel = status?.openrouter?.model || fallbackStatus?.model;

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isSending]);

    const prompts = suggestedPrompts && suggestedPrompts.length > 0
        ? suggestedPrompts
        : (context?.albumId || (context?.trackIds && context.trackIds.length > 0))
            ? DEFAULT_CONTEXT_PROMPTS
            : DEFAULT_MAINTENANCE_PROMPTS;

    const sendMessage = async (textOverride?: string) => {
        const content = (textOverride ?? input).trim();
        if (!content || isSending) return;

        setError(null);
        if (!textOverride) setInput("");

        const userMsg: UiMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content
        };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setIsSending(true);

        try {
            const payloadHistory: AiChatMessage[] = nextMessages.map(m => ({
                role: m.role,
                content: m.content
            }));
            const res = await API.aiChat(payloadHistory, context);

            const assistantId = `a-${Date.now()}`;
            const assistantMsg: UiMessage = {
                id: assistantId,
                role: "assistant",
                content: res.reply,
                toolTrace: res.toolTrace,
                proposal: res.proposal
            };

            if (res.proposal) {
                setSelectedActionIds(prev => ({
                    ...prev,
                    [res.proposal!.id]: res.proposal!.actions.map(a => a.id)
                }));
            }

            setMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            const errMsg = err?.response?.data?.error || err?.message || "Failed to contact AI assistant";
            setError(errMsg);
        } finally {
            setIsSending(false);
        }
    };

    const toggleActionSelection = (proposalId: string, actionId: string) => {
        setSelectedActionIds(prev => {
            const current = prev[proposalId] || [];
            const exists = current.includes(actionId);
            return {
                ...prev,
                [proposalId]: exists
                    ? current.filter(id => id !== actionId)
                    : [...current, actionId]
            };
        });
    };

    const toggleSelectAllActions = (proposal: AiProposal) => {
        const unappliedIds = proposal.actions.filter(a => !a.applied).map(a => a.id);
        const current = selectedActionIds[proposal.id] || [];
        const allSelected = unappliedIds.length > 0 && unappliedIds.every(id => current.includes(id));
        setSelectedActionIds(prev => ({
            ...prev,
            [proposal.id]: allSelected ? [] : unappliedIds
        }));
    };

    const handleApplyProposal = async (msgId: string, proposal: AiProposal) => {
        const ids = (selectedActionIds[proposal.id] || []).filter(id => {
            const act = proposal.actions.find(a => a.id === id);
            return act && !act.applied;
        });
        if (ids.length === 0 || applyingProposalId) return;

        setApplyingProposalId(proposal.id);
        setError(null);
        try {
            const res = await API.aiApply(proposal.id, ids);
            const appliedSet = new Set(res.results.filter(r => r.ok).map(r => r.actionId));

            setMessages(prev =>
                prev.map(m => {
                    if (m.id !== msgId || !m.proposal) return m;
                    const updatedActions = m.proposal.actions.map(a =>
                        appliedSet.has(a.id) ? { ...a, applied: true } : a
                    );
                    return {
                        ...m,
                        proposal: { ...m.proposal, actions: updatedActions },
                        appliedCount: (m.appliedCount || 0) + res.applied
                    };
                })
            );

            if (res.applied > 0) {
                notify.success(`Applied ${res.applied} change${res.applied === 1 ? "" : "s"}`);
                window.dispatchEvent(new CustomEvent("refresh-admin-tracks"));
                window.dispatchEvent(new CustomEvent("refresh-admin-albums"));
                window.dispatchEvent(new CustomEvent("refresh-admin-releases"));
                onApplied?.();
            }
            if (res.failed > 0) {
                setError(res.errors.join("; ") || `${res.failed} action(s) failed`);
            }
        } catch (err: any) {
            const errMsg = err?.response?.data?.error || err?.message || "Failed to apply changes";
            setError(errMsg);
            notify.error(err, "Apply failed");
        } finally {
            setApplyingProposalId(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const renderActionItem = (proposalId: string, action: AiProposedAction) => {
        const selected = (selectedActionIds[proposalId] || []).includes(action.id);
        const isApplied = !!action.applied;

        return (
            <div
                key={action.id}
                className={`rounded-lg border p-2.5 text-xs transition-colors ${
                    isApplied
                        ? "bg-success/10 border-success/30 opacity-80"
                        : selected
                        ? "bg-base-100 border-primary/30"
                        : "bg-base-200/50 border-base-content/10 opacity-70"
                }`}
            >
                <div className="flex items-start gap-2.5">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-primary mt-0.5"
                        checked={isApplied ? true : selected}
                        disabled={isApplied || applyingProposalId === proposalId}
                        onChange={() => toggleActionSelection(proposalId, action.id)}
                    />
                    {action.previewImageUrl && (
                        <img
                            src={action.previewImageUrl}
                            alt=""
                            className="w-10 h-10 rounded object-cover border border-base-content/10 shrink-0"
                        />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold truncate">{action.label}</span>
                            {isApplied && (
                                <span className="badge badge-success badge-xs gap-1 shrink-0">
                                    <Check size={10} /> Applied
                                </span>
                            )}
                        </div>
                        {action.reason && (
                            <p className="text-[11px] opacity-60">{action.reason}</p>
                        )}
                        <div className="space-y-0.5 pt-0.5">
                            {action.diffs.map((d, idx) => (
                                <div key={idx} className="flex flex-wrap items-baseline gap-1.5 font-mono text-[11px]">
                                    <span className="opacity-60">{d.field}:</span>
                                    <span className="line-through opacity-50 break-all">
                                        {d.before === null ? "empty" : String(d.before)}
                                    </span>
                                    <span className="opacity-40">→</span>
                                    <span className="text-primary font-semibold break-all">
                                        {d.after === null ? "empty" : String(d.after)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (checkedStatus && !hasAI) {
        return (
            <div className="alert alert-warning shadow-sm border border-warning/20 text-sm">
                <Cpu size={18} className="text-warning shrink-0" />
                <div>
                    <p className="font-semibold">AI Assistant is not configured</p>
                    <p className="text-xs opacity-80">
                        Configure an <strong>OpenRouter API Key</strong> in Admin → Integrations to ask the assistant to search metadata, match tracklists, or fix tags.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col bg-base-200/50 border border-base-content/10 rounded-xl overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-base-300/50 border-b border-base-content/10">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles size={16} className="text-secondary shrink-0" />
                    <span className="font-bold text-sm">AI Library Assistant</span>
                    {activeModel && (
                        <span className="badge badge-ghost badge-xs font-mono opacity-60 hidden sm:inline-flex">
                            {activeModel}
                        </span>
                    )}
                </div>
                {messages.length > 0 && (
                    <button
                        type="button"
                        className="btn btn-xs btn-ghost gap-1 opacity-60 hover:opacity-100"
                        onClick={() => {
                            setMessages([]);
                            setSelectedActionIds({});
                            setError(null);
                        }}
                        disabled={isSending}
                    >
                        <Trash2 size={12} /> Clear
                    </button>
                )}
            </div>

            {contextSummary && (
                <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs flex items-center gap-2">
                    <span className="badge badge-primary badge-xs">Context</span>
                    <span className="font-medium truncate">{contextSummary}</span>
                </div>
            )}

            {/* Chat history */}
            <div
                ref={scrollRef}
                className={`p-4 space-y-4 overflow-y-auto ${compact ? "max-h-[50vh] min-h-[240px]" : "min-h-[320px] max-h-[540px]"}`}
            >
                {messages.length === 0 ? (
                    <div className="py-6 text-center space-y-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium opacity-80">
                                Chiedi in linguaggio naturale cosa vuoi controllare o sistemare nella libreria.
                            </p>
                            <p className="text-xs opacity-50 max-w-lg mx-auto">
                                L'assistente cerca nella tua libreria e nei cataloghi esterni (iTunes, MusicBrainz, Discogs) e ti mostra un'anteprima delle modifiche prima di applicarle.
                            </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            {prompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className="btn btn-xs btn-outline border-base-content/20 hover:btn-secondary"
                                    onClick={() => sendMessage(prompt)}
                                    disabled={isSending}
                                >
                                    <Sparkles size={12} />
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
                        >
                            {msg.role === "user" ? (
                                <div className="bg-primary text-primary-content rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
                                    {msg.content}
                                </div>
                            ) : (
                                <div className="w-full space-y-2.5">
                                    {msg.toolTrace && msg.toolTrace.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {msg.toolTrace.map((t, idx) => (
                                                <span
                                                    key={idx}
                                                    className="badge badge-ghost badge-xs gap-1 opacity-70"
                                                    title={t.name}
                                                >
                                                    <Wrench size={10} />
                                                    {t.summary}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {msg.content && (
                                        <div className="bg-base-100 border border-base-content/10 rounded-2xl rounded-tl-sm px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">
                                            {msg.content}
                                        </div>
                                    )}

                                    {msg.proposal && msg.proposal.actions.length > 0 && (() => {
                                        const proposal = msg.proposal!;
                                        const unapplied = proposal.actions.filter(a => !a.applied);
                                        const selected = selectedActionIds[proposal.id] || [];
                                        const selectedUnappliedCount = unapplied.filter(a => selected.includes(a.id)).length;
                                        const isApplying = applyingProposalId === proposal.id;
                                        const allUnappliedSelected = unapplied.length > 0 && selectedUnappliedCount === unapplied.length;

                                        return (
                                            <div className="bg-base-300/60 border border-secondary/30 rounded-xl p-3 space-y-2.5">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 text-xs font-bold">
                                                        <span>Proposed Changes ({proposal.actions.length})</span>
                                                        {unapplied.length > 1 && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-xs"
                                                                onClick={() => toggleSelectAllActions(proposal)}
                                                                disabled={isApplying}
                                                            >
                                                                {allUnappliedSelected ? "Deselect All" : "Select All"}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {unapplied.length > 0 ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-xs gap-1.5"
                                                            disabled={selectedUnappliedCount === 0 || isApplying}
                                                            onClick={() => handleApplyProposal(msg.id, proposal)}
                                                        >
                                                            {isApplying ? (
                                                                <Loader2 size={12} className="animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 size={12} />
                                                            )}
                                                            Apply Selected ({selectedUnappliedCount})
                                                        </button>
                                                    ) : (
                                                        <span className="badge badge-success badge-sm gap-1">
                                                            <CheckCircle2 size={12} /> All Applied
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                                    {proposal.actions.map(action => renderActionItem(proposal.id, action))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {isSending && (
                    <div className="flex items-center gap-2 text-xs opacity-70 px-1">
                        <Loader2 size={14} className="animate-spin text-secondary" />
                        <span>Inspecting library & external sources...</span>
                    </div>
                )}
            </div>

            {error && (
                <div className="mx-4 mb-3 alert alert-error py-2 text-xs">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Prompt input */}
            <form
                className="p-3 bg-base-300/40 border-t border-base-content/10 flex gap-2 items-end"
                onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                }}
            >
                <textarea
                    rows={2}
                    className="textarea textarea-bordered textarea-sm flex-1 bg-base-100 resize-none leading-snug"
                    placeholder="Es: Mi trovi i titoli giusti delle tracce di questo album?"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                />
                <button
                    type="submit"
                    className="btn btn-secondary btn-sm gap-1.5 h-10 px-4"
                    disabled={!input.trim() || isSending}
                >
                    {isSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    Send
                </button>
            </form>
        </div>
    );
};
