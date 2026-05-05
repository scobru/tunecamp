import { useState, useEffect } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  RefreshCw,
  Save,
} from "lucide-react";

import { AdminUserModal } from "../components/modals/AdminUserModal";
import { AdminSettingsPanel } from "../components/admin/AdminSettingsPanel";
import { AdminUsersList } from "../components/admin/AdminUsersList";
import { AdminReleasesList } from "../components/admin/AdminReleasesList";
import { AdminMaintenancePanel } from "../components/admin/AdminMaintenancePanel";
import { CurationQueue } from "../components/admin/CurationQueue";

import { BackupPanel } from "../components/admin/BackupPanel";

export const Admin = () => {
  const { isAuthenticated, isLoading, role, user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = role === 'admin' || role === 'super_user' || role === 'root_admin';
  const isSuperUser = role === 'super_user';
  const isRootAdmin = !!user?.isRootAdmin;
  
  const [activeTab, setActiveTab] = useState<
    | "releases"
    | "curation"
    | "users"
    | "settings"
    | "system"
    | "backup"
    | "maintenance"
  >(isRootAdmin ? "users" : "releases");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || (role !== 'admin' && role !== 'super_user' && role !== 'root_admin')) {
      navigate("/");
      return;
    }
    if (isAdmin || isSuperUser) {
        loadStats();
    }
  }, [isAuthenticated, role, isLoading]);

  if (isLoading)
    return (
      <div className="p-12 text-center opacity-50">Loading dashboard...</div>
    );

  const loadStats = async () => {
    try {
      const data = await API.getAdminStats();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSystemAction = async (action: "cleanup" | "consolidate") => {
    const isCleanup = action === "cleanup";
    if (
      !confirm(
        `Are you sure you want to ${isCleanup ? "cleanup the network" : "consolidate files"}? This may take a while.`,
      )
    )
      return;
    try {
      if (isCleanup) {
        await API.cleanupNetwork();
        alert(`Network cleanup finished successfully.`);
      } else {
        const res = await API.consolidateFiles();
        alert(`File consolidation finished. Success: ${res.success}, Failed: ${res.failed}, Skipped: ${res.skipped}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to start action");
    }
  };

  if (!isAuthenticated || (role !== 'admin' && role !== 'super_user' && role !== 'root_admin')) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold flex items-center gap-3">
        <Settings size={32} className="text-primary" /> {isAdmin ? "Admin Dashboard" : "Artist Dashboard"}
      </h1>

      {/* Stats Cards */}
      {isAdmin && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold uppercase tracking-wider">Total Users</div>
            <div className="stat-value text-primary">{stats.totalUsers}</div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold uppercase tracking-wider">Total Tracks</div>
            <div className="stat-value text-secondary">{stats.totalTracks}</div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold uppercase tracking-wider">Storage Used</div>
            <div className="stat-value text-accent">
              {(stats.storageUsed / 1024 / 1024 / 1024).toFixed(2)} GB
            </div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold uppercase tracking-wider">Network Sites</div>
            <div className="stat-value">{stats.networkSites}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab ${activeTab === "releases" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("releases")}
        >
          {isAdmin ? "All Releases" : "My Releases"}
        </a>
        {isAdmin && (
          <a
            role="tab"
            className={`tab ${activeTab === "curation" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("curation")}
          >
            Curation Queue
          </a>
        )}
        {isRootAdmin && (
          <>
            <a
              role="tab"
              className={`tab ${activeTab === "users" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              Users
            </a>
          </>
        )}
        {isAdmin && !isSuperUser && (
          <>
            <a
              role="tab"
              className={`tab ${activeTab === "settings" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </a>
          </>
        )}
        {isRootAdmin && (
          <>
            <a
              role="tab"
              className={`tab ${activeTab === "system" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("system")}
            >
              System
            </a>
            <a
              role="tab"
              className={`tab ${activeTab === "backup" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("backup")}
            >
              Backup
            </a>
            <a
              role="tab"
              className={`tab ${activeTab === "maintenance" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("maintenance")}
            >
              Maintenance
            </a>
          </>
        )}
      </div>

      <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px] glass-effect">
        {activeTab === "releases" && (
           <div className="space-y-4">
           <div className="flex justify-between items-center">
             <h3 className="font-bold text-lg">{isAdmin ? "All Releases" : "My Releases"}</h3>
             {(!isSuperUser || user?.artistId) && (
               <button
                 className="btn btn-sm btn-primary shadow-md"
                 onClick={() => navigate("/admin/release/new")}
               >
                 New Release
               </button>
             )}
           </div>
           <AdminReleasesList mine={!isAdmin} />
         </div>
        )}

        {activeTab === "curation" && isAdmin && <CurationQueue />}

        {activeTab === "system" && isAdmin && (
          <div className="space-y-6">
            <h3 className="font-bold text-lg">System Maintenance</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="card card-m3 bg-base-200/50">
                <div className="card-body">
                  <h2 className="card-title text-accent">
                    <RefreshCw /> Cleanup
                  </h2>
                  <p className="opacity-70 text-sm">
                    Check reachability of all registered sites on GunDB and
                    remove dead entries.
                  </p>
                  <div className="card-actions justify-end mt-4">
                    <button
                      className="btn btn-accent btn-outline btn-sm"
                      onClick={() => handleSystemAction("cleanup")}
                    >
                      Network Cleanup
                    </button>
                  </div>
                </div>
              </div>

              <div className="card card-m3 bg-base-200/50">
                <div className="card-body">
                  <h2 className="card-title text-primary">
                    <Save /> Consolidate
                  </h2>
                  <p className="opacity-70 text-sm">
                    Rename physical files to "Artist - Title" format based on database tags.
                  </p>
                  <div className="card-actions justify-end mt-4">
                    <button
                      className="btn btn-primary btn-outline btn-sm"
                      onClick={() => handleSystemAction("consolidate")}
                    >
                      Consolidate Files
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "users" && isAdmin && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">User Management</h3>
              <button
                className="btn btn-sm btn-primary shadow-md"
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("open-admin-user-modal"),
                  )
                }
              >
                Add User
              </button>
            </div>
            <AdminUsersList />
          </div>
        )}

        {activeTab === "settings" && isAdmin && <AdminSettingsPanel />}
        {activeTab === "backup" && isAdmin && <BackupPanel />}
        {activeTab === "maintenance" && isAdmin && <AdminMaintenancePanel />}
      </div>

      <AdminUserModal
        onUserUpdated={() =>
          window.dispatchEvent(new CustomEvent("refresh-admin-users"))
        }
      />
      {/* AdminTrackModal removed - handled globally in MainLayout */}
      {/* PlaylistModal removed - handled globally in MainLayout */}
    </div>
  );
};

export default Admin;

