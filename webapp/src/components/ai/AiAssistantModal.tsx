import { useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { AiAssistantBox } from "./AiAssistantBox";
import type { AiContext } from "../../services/api/admin";

interface AiAssistantModalProps {
    isOpen: boolean;
    onClose: () => void;
    context?: AiContext;
    contextSummary?: string;
    suggestedPrompts?: string[];
    onApplied?: () => void;
}

export const AiAssistantModal = ({
    isOpen,
    onClose,
    context,
    contextSummary,
    suggestedPrompts,
    onApplied
}: AiAssistantModalProps) => {
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-base-300 w-full max-w-3xl rounded-2xl border border-base-content/10 shadow-level-1 overflow-hidden flex flex-col max-h-[88vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-content/10">
                    <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-secondary" />
                        <h3 className="font-bold text-base">Ask AI Assistant</h3>
                    </div>
                    <button
                        type="button"
                        className="btn btn-sm btn-circle btn-ghost"
                        onClick={onClose}
                        aria-label="Close AI Assistant"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto">
                    <AiAssistantBox
                        compact
                        context={context}
                        contextSummary={contextSummary}
                        suggestedPrompts={suggestedPrompts}
                        onApplied={onApplied}
                    />
                </div>
            </div>
        </div>
    );
};
