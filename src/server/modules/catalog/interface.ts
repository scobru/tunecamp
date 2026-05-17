import { ViewerContext } from "../../common/visibility.js";

export enum ItemType {
  ARTIST = 'artist',
  ALBUM = 'album',
  RELEASE = 'release',
  TRACK = 'track'
}

export interface CatalogItem {
  id: number | string;
  type: ItemType;
  title: string;
  artistName: string;
  // Common fields...
  visibility: 'public' | 'unlisted' | 'private';
  status: 'draft' | 'released';
}

export interface SearchResults {
  artists: any[];
  albums: any[];
  tracks: any[];
}

export interface CatalogOverview {
  stats: any;
  releases: any[];
  recentAlbums: any[];
}

/**
 * The Unified Catalog Module.
 * A deep module that encapsulates the dual-table storage (Santuario vs Arena)
 * and enforces visibility rules.
 */
export interface Catalog {
  /**
   * Resolves an item by ID or Slug.
   * Internally handles falling back between Santuario (albums) and Arena (releases).
   */
  resolve(idOrSlug: string | number, context: ViewerContext): Promise<CatalogItem | undefined>;

  /**
   * High-level search that respects visibility and ownership.
   */
  search(query: string, context: ViewerContext): Promise<SearchResults>;

  /**
   * Returns the personalized overview for the dashboard/home.
   */
  getOverview(context: ViewerContext): Promise<CatalogOverview>;

  /**
   * Promotes a Library Album from Santuario to Arena.
   * This is where the logic for creating 'releases' and 'release_tracks' lives.
   */
  promote(albumId: number, context: ViewerContext): Promise<void>;

  /**
   * Updates an item's visibility (e.g., from 'private' to 'public').
   * If the item is in Arena, this may trigger federation (ActivityPub/Gun).
   */
  setVisibility(id: number, type: ItemType, visibility: 'public' | 'private' | 'unlisted', context: ViewerContext): Promise<void>;

  /**
   * Deletes an item. Handles cleanup across both Santuario and Arena.
   */
  deleteItem(id: number, type: ItemType, context: ViewerContext, options?: { keepFiles?: boolean }): Promise<void>;
}
