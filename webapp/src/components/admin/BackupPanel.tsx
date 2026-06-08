import { useState, useEffect } from 'react';
import { Download, Upload, AlertTriangle, FileAudio, Cloud } from 'lucide-react';
import API from '../../services/api';

export const BackupPanel = () => {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [gdriveLoading, setGdriveLoading] = useState(false);
    const [hasGDrive, setHasGDrive] = useState(false);

    useEffect(() => {
        checkGDrive();
    }, []);

    const checkGDrive = async () => {
        try {
            const accounts = await API.getGDriveAccounts();
            setHasGDrive(accounts.length > 0);
        } catch (e) {
            console.error("Failed to check GDrive accounts:", e);
        }
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("WARNING: This will overwite your database and music library with the backup contents. This action cannot be undone. Are you sure?")) {
            e.target.value = ''; // Reset input
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            await API.uploadBackup(file, (percent) => setUploadProgress(percent));
            alert("Restore started successfully! The server will restart automatically. The page will reload in a few seconds.");
            setTimeout(() => window.location.reload(), 5000);
        } catch (error: any) {
            console.error(error);
            const msg = error.message || 'Unknown error';
            if (msg.includes('timeout') || msg.includes('504') || msg.includes('502') || msg.includes('Network Error')) {
                alert(`Restore may still be running on the server.\n\nThe connection timed out (possibly due to reverse proxy settings), but the restore process continues in the background.\n\nTry reloading the page in a few minutes.`);
            } else {
                alert(`Restore failed: ${msg}`);
            }
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleGDriveBackup = async () => {
        if (!hasGDrive) {
            alert("Please connect a Google Drive account in the 'Storage' tab first.");
            return;
        }

        setGdriveLoading(true);
        try {
            const res = await API.backupToGDrive();
            alert(`Backup successful! File "${res.fileName}" saved to your Google Drive.`);
        } catch (error: any) {
            console.error(error);
            alert("Google Drive backup failed: " + (error.message || "Unknown error"));
        } finally {
            setGdriveLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">Backup & Restore</h2>
                <p className="opacity-70 text-sm">Manage system backups and data portability.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Backup Section */}
                <div className="card bg-base-200 border border-base-content/5">
                    <div className="card-body">
                        <h2 className="card-title"><Download /> Export Data</h2>
                        <p className="opacity-70 text-sm mb-4">Download a complete snapshot of your TuneCamp instance.</p>
                        
                        <div className="flex flex-col gap-3">
                            <a 
                                href={`/api/admin/backup/full?token=${API.getToken()}`} 
                                target="_blank" 
                                className="btn btn-primary gap-2"
                                rel="noopener noreferrer"
                            >
                                <Download size={18} /> Download Full Backup
                            </a>
                            <div className="text-xs opacity-50 px-1">
                                Includes: Database, Music Files, Configuration, Keys.
                            </div>
                            
                            <div className="divider my-0"></div>

                            <button 
                                className="btn btn-accent gap-2"
                                onClick={handleGDriveBackup}
                                disabled={gdriveLoading}
                            >
                                {gdriveLoading ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                ) : (
                                    <Cloud size={18} />
                                )}
                                Save to Google Drive
                            </button>
                            <div className="text-xs opacity-50 px-1">
                                {hasGDrive 
                                    ? "Uploads a full backup directly to your connected Drive account."
                                    : "Connect a GDrive account in 'Storage' to enable cloud backups."
                                }
                            </div>

                            <div className="divider my-0"></div>

                            <a 
                                href={`/api/admin/backup/audio?token=${API.getToken()}`} 
                                target="_blank" 
                                className="btn btn-secondary btn-outline gap-2"
                                rel="noopener noreferrer"
                            >
                                <FileAudio size={18} /> Download Audio Only
                            </a>
                            <div className="text-xs opacity-50 px-1">
                                Includes: Only Music Files (No database or settings).
                            </div>
                        </div>
                    </div>
                </div>

                {/* Restore Section */}
                <div className="card bg-error/10 border border-error/20">
                    <div className="card-body">
                        <h2 className="card-title text-error"><Upload /> Restore Data</h2>
                        <div className="alert alert-warning text-xs shadow-level-1">
                            <div>
                                <AlertTriangle size={16} />
                                <span>Warning: Restoring will overwrite all current data!</span>
                            </div>
                        </div>
                        <p className="opacity-70 text-sm mb-4">Upload a previously generated backup (.zip or .tar.gz file) to restore your system.</p>

                        <div className="form-control w-full">
                            <input 
                                type="file" 
                                className="file-input file-input-bordered file-input-error w-full" 
                                accept=".zip,.tar.gz"
                                onChange={handleRestore}
                                disabled={uploading}
                            />
                        </div>

                        {uploading && (
                            <div className="mt-4">
                                <div className="text-xs mb-1">Restoring... {uploadProgress}%</div>
                                <progress className="progress progress-error w-full" value={uploadProgress} max="100"></progress>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

