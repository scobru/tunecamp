# Component Inventory - TuneCamp WebApp

## UI Framework
- **Base:** React 19, Tailwind CSS, DaisyUI.
- **Icons:** Lucide-React.

## Core Components

### 1. Player System
- **PlayerBar:** Global fixed playback controller. Handles audio node management, progress tracking, and volume.
- **Waveform:** Visual audio representation. Supports Canvas rendering (JSON data) or SVG Mask rendering.
- **LyricsPanel:** Overlay for synchronized or static lyrics.
- **QueuePanel:** Playlist/Queue management drawer.

### 2. Layout & Navigation
- **MainLayout:** Primary wrapper with Sidebar and PlayerBar.
- **Sidebar:** Navigation links (Home, Library, Search, Admin).
- **CommandPalette:** Global search and quick action interface.

### 3. Administration Panels
- **AdminUsersList:** Management table for local users and roles.
- **AdminTracksList / AdminReleasesList:** Library management with batch edit capabilities.
- **ActivityPubPanel:** Federation status and inbox/outbox monitoring.
- **MaintenancePanel:** Library scan triggers and database cleanup tools.

### 4. Interactive Modals
- **AuthModal:** Handles Login/Register with Zen identity integration.
- **CheckoutModal:** Blockchain-based payment interface for releases.
- **MetadataPickerModal:** Interface for selecting/editing audio tags.
- **UploadTracksModal:** File upload and processing status.

## Design Patterns
- **State Integration:** Components are tightly coupled with `usePlayerStore` and `useAuthStore` via Zustand.
- **Dynamic Theming:** Uses dominant color extraction from album art to tint the UI.
- **Responsive Design:** Mobile-first approach with drawer-based navigation on small screens.
