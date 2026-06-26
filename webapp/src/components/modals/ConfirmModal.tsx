import { useEffect, useRef } from 'react';
import { useConfirmStore } from '../../stores/useConfirmStore';
import { HelpCircle, AlertTriangle } from 'lucide-react';

export const ConfirmModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { isOpen, message, options, accept, cancel } = useConfirmStore();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            dialog.showModal();
        } else {
            dialog.close();
        }
    }, [isOpen]);

    // Handle when user hits Escape key to close the dialog
    const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
        e.preventDefault();
        cancel();
    };

    if (!isOpen) return null;

    const {
        title = 'Confirm Action',
        confirmText = 'OK',
        cancelText = 'Cancel',
        isDestructive = false
    } = options;

    return (
        <dialog 
            ref={dialogRef} 
            className="modal modal-bottom sm:modal-middle"
            onClose={handleCancel}
        >
            <div className="modal-box bg-base-200 border border-base-content/10 shadow-xl max-w-md w-full mx-auto relative p-6">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full flex-shrink-0 ${isDestructive ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
                        {isDestructive ? (
                            <AlertTriangle size={24} className="animate-pulse" />
                        ) : (
                            <HelpCircle size={24} />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-base-content font-sans mb-2">
                            {title}
                        </h3>
                        <p className="text-sm text-base-content/85 whitespace-pre-wrap font-sans leading-relaxed break-words">
                            {message}
                        </p>
                    </div>
                </div>

                <div className="modal-action flex justify-end gap-3 mt-6">
                    <button 
                        type="button" 
                        className="btn btn-ghost border border-base-content/10 hover:bg-base-300 font-sans"
                        onClick={cancel}
                    >
                        {cancelText}
                    </button>
                    <button 
                        type="button" 
                        className={`btn font-sans ${isDestructive ? 'btn-error text-error-content' : 'btn-primary text-primary-content'} shadow-sm`}
                        onClick={accept}
                        autoFocus
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
            {/* Backdrop click also cancels */}
            <form method="dialog" className="modal-backdrop bg-black/60 backdrop-blur-xs">
                <button onClick={(e) => { e.preventDefault(); cancel(); }}>close</button>
            </form>
        </dialog>
    );
};
