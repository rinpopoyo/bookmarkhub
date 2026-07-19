/**
 * TypeScript types for the X Bookmark Manager
 * Local-first, privacy-focused bookmark management
 */

// Platform-specific metadata types (discriminated union)
export interface XTwitterMetadata {
  platform: 'x.com'
  tweet_date: string
  extracted_at: string
  username: string
  display_name: string
  has_video: boolean
  video_url?: string
  images?: string[]
  profile_image_normal?: string
  profile_image_bigger?: string
  engagement?: {
    likes?: number
    retweets?: number
    replies?: number
  }
}

export interface GenericWebMetadata {
  platform: 'web' | 'other'
  [key: string]: unknown
}

export type BookmarkMetadata = XTwitterMetadata | GenericWebMetadata

export function isXTwitterMetadata(m?: BookmarkMetadata): m is XTwitterMetadata {
  return m !== undefined && m !== null && m.platform === 'x.com'
}

// Core bookmark interface for localStorage
export interface Bookmark {
  id: number
  user_id: string
  title: string
  url: string
  description: string
  content: string
  thumbnail_url?: string
  favicon_url?: string
  author: string
  domain: string
  source_platform: string
  source_id?: string
  engagement_score: number
  is_starred: boolean
  is_read: boolean
  is_archived: boolean
  is_shared: boolean
  shared_at?: string
  is_deleted: boolean
  deleted_at?: string
  tags: string[]
  collections: string[] // Array of collection IDs
  primaryCollection?: string // Main collection
  metadata?: BookmarkMetadata
  _isDemo?: boolean
  created_at: string
  updated_at: string
}

// Bookmark metrics for engagement data
export interface BookmarkMetrics {
  likes: string
  retweets: string
  replies: string
}

// For creating new bookmarks
export interface BookmarkInsert extends Omit<
  Bookmark,
  'id' | 'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'
> {
  id?: number
}

// For updating existing bookmarks
export interface BookmarkUpdate extends Partial<
  Omit<Bookmark, 'id' | 'created_at'>
> {
  updated_at?: string
}

// Filter and search types
export interface BookmarkFilters {
  tags: string[]
  isStarred?: boolean
  dateRange?: {
    start: string
    end: string
  }
  domain?: string
  hasMedia?: boolean
}

export interface SearchOptions {
  query?: string
  filters?: BookmarkFilters
  sortBy?: 'newest' | 'oldest' | 'title' | 'domain' | 'relevance'
  limit?: number
  offset?: number
}

// Application metadata
export interface AppMetadata {
  version: string
  lastBackup?: string
  totalBookmarks: number
  createdAt: string
  lastUpdate: string
  storageUsed?: number
  maxStorage?: number
  importSource?: string
}

// Export/Import data structure
export interface ExportData {
  bookmarks: Bookmark[]
  collections?: unknown[] // Will be properly typed when collections are implemented
  metadata: AppMetadata
  exportedAt: string
  version: string
}

// Storage service interface
export interface StorageService {
  // Bookmark CRUD operations
  getBookmarks(): Promise<Bookmark[]>
  createBookmark(bookmark: BookmarkInsert): Promise<Bookmark>
  updateBookmark(id: number, updates: BookmarkUpdate): Promise<Bookmark>
  deleteBookmark(id: number): Promise<void>
  toggleBookmarkStar(id: number): Promise<Bookmark>

  // Search and filter operations
  searchBookmarks(query: string): Promise<Bookmark[]>
  getBookmarksByTag(tag: string): Promise<Bookmark[]>
  getStarredBookmarks(): Promise<Bookmark[]>

  // Metadata operations
  getMetadata(): Promise<AppMetadata>

  // Data export/import
  exportData(): Promise<ExportData>
  importData(data: Partial<ExportData>): Promise<void>
  clearAllData(): Promise<void>

  // Utility operations
  getStorageInfo(): Promise<{
    isAvailable: boolean
    usedSpace: number
    totalBookmarks: number
    lastUpdate: string
  }>
}

// Error types
export class BookmarkError extends Error {
  public code:
    | 'NOT_FOUND'
    | 'STORAGE_FULL'
    | 'INVALID_DATA'
    | 'STORAGE_UNAVAILABLE'
  public details?: unknown

  constructor(
    message: string,
    code: 'NOT_FOUND' | 'STORAGE_FULL' | 'INVALID_DATA' | 'STORAGE_UNAVAILABLE',
    details?: unknown
  ) {
    super(message)
    this.name = 'BookmarkError'
    this.code = code
    this.details = details
  }
}

// UI State types for the store
export interface BookmarkState {
  // Data
  bookmarks: Bookmark[]

  // UI State
  selectedTags: string[]
  searchQuery: string
  activeTab: number
  viewMode: 'grid' | 'list'
  isLoading: boolean
  isAIPanelOpen: boolean
  isFiltersPanelOpen: boolean
  activeSidebarItem: string
  error: string | null

  // Metadata
  metadata: AppMetadata
}

// Action types for the store
export interface BookmarkActions {
  // Data actions
  loadBookmarks: () => Promise<void>
  addBookmark: (bookmark: BookmarkInsert) => Promise<void>
  removeBookmark: (id: number) => Promise<void>
  updateBookmark: (id: number, updates: BookmarkUpdate) => Promise<void>
  toggleStarBookmark: (id: number) => Promise<void>
  searchBookmarks: (query: string) => Promise<void>

  // UI actions
  setSelectedTags: (tags: string[]) => void
  addTag: (tag: string) => void
  removeTag: (tag: string) => void
  clearTags: () => void
  setSearchQuery: (query: string) => void
  setActiveTab: (tab: number) => void
  setViewMode: (mode: 'grid' | 'list') => void
  setIsLoading: (loading: boolean) => void
  setAIPanelOpen: (isOpen: boolean) => void
  toggleAIPanel: () => void
  setFiltersPanelOpen: (isOpen: boolean) => void
  toggleFiltersPanel: () => void
  setActiveSidebarItem: (item: string) => void
  setError: (error: string | null) => void

  // Data management actions
  exportBookmarks: () => Promise<ExportData>
  importBookmarks: (data: Partial<ExportData>) => Promise<void>
  clearAllData: () => Promise<void>

  // Initialize app
  initialize: () => Promise<void>
}

// Combined store type
export type BookmarkStore = BookmarkState & BookmarkActions
