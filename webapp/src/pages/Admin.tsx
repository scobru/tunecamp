import { useState, useEffect } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  Settings,
} from "lucide-react";

import { AdminUserModal } from "../components/modals/AdminUserModal";
import { AdminSettingsPanel } from "../components/admin/AdminSettingsPanel";
import { AdminUsersList } from "../components/admin/AdminUsersList";
import { AdminReleasesList } from "../components/admin/AdminReleasesList";
import { AdminMaintenancePanel } from "../components/admin/AdminMaintenancePanel";
import { CurationQueue } from "../components/admin/CurationQueue";
import { IntegrationsPanel } from "../components/admin/IntegrationsPanel";
import { BackupPanel } from "../components/admin/BackupPanel";
import { StoragePanel } from "../components/admin/StoragePanel";
import { AdminAssetsList } from "../components/admin/AdminAssetsList";

const Admin = () => {
  const { isAuthenticated, isLoading, role, user } = useAuthStore();
  const navigate = useNavigate();
  const isRootAdmin = !!user?.isRootAdmin || role === 'root_admin';
  const isManager = role === 'admin';
  const isSuperUser = role === 'super_user';
  const isAdmin = isRootAdmin || isManager || isSuperUser;
  
  const [activeTab, setActiveTab] = useState<
    | "releases"
    | "curation"
    | "users"
    | "settings"
    | "backup"
    | "storage"
    | "maintenance"
    | "integrations"
    | "store"
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


  if (!isAuthenticated || (role !== 'admin' && role !== 'super_user' && role !== 'root_admin')) return null;

  const getDashboardTitle = () => {
    if (isRootAdmin) return "Root Admin Dashboard";
    if (isManager) return "Manager Dashboard";
    if (isSuperUser) return "Curator Dashboard";
    return "Artist Dashboard";
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold flex items-center gap-3">
        <Settings size={32} className="text-primary" /> {getDashboardTitle()}
      </h1>

      {/* Stats Cards */}
      {isAdmin && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Total Users</div>
            <div className="stat-value text-primary">{stats.totalUsers}</div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Total Tracks</div>
            <div className="stat-value text-secondary">{stats.totalTracks}</div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Storage Used</div>
            <div className="stat-value text-accent">
              {(stats.storageUsed / 1024 / 1024 / 1024).toFixed(2)} GB
            </div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Network Sites</div>
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
        {(isRootAdmin || isManager || isSuperUser) && (
          <a
            role="tab"
            className={`tab ${activeTab === "curation" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("curation")}
          >
            Curation Queue
          </a>
        )}
        {(isRootAdmin || isManager) && (
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
        {isRootAdmin && (
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
          <a
            role="tab"
            className={`tab ${activeTab === "backup" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("backup")}
          >
            Backup
          </a>
        )}
        <a
          role="tab"
          className={`tab ${activeTab === "storage" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("storage")}
        >
          Storage
        </a>
        {isAdmin && (
            <a
              role="tab"
              className={`tab ${activeTab === "maintenance" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("maintenance")}
            >
              Maintenance
            </a>
        )}
        {isRootAdmin && (
            <a
              role="tab"
              className={`tab ${activeTab === "integrations" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("integrations")}
            >
              Integrations
            </a>
        )}
        <a
          role="tab"
          className={`tab ${activeTab === "store" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("store")}
        >
          Store
        </a>
      </div>

      <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px] glass-effect">
        {activeTab === "releases" && (
           <div className="space-y-4">
           <div className="flex justify-between items-center">
             <h3 className="font-bold text-lg">{isAdmin ? "All Releases" : "My Releases"}</h3>
             {(isAdmin || isSuperUser) && (
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

        {activeTab === "curation" && (isRootAdmin || isManager || isSuperUser) && <CurationQueue />}


        {activeTab === "users" && (isRootAdmin || isManager) && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">User Management</h3>
              {isRootAdmin && (
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
              )}
            </div>
            <AdminUsersList />
          </div>
        )}

        {activeTab === "settings" && isRootAdmin && <AdminSettingsPanel />}
        {activeTab === "backup" && isRootAdmin && <BackupPanel />}
        {activeTab === "storage" && isAdmin && <StoragePanel />}
        {activeTab === "maintenance" && isAdmin && <AdminMaintenancePanel />}
        {activeTab === "integrations" && isRootAdmin && <IntegrationsPanel />}
        {activeTab === "store" && <AdminAssetsList />}
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

