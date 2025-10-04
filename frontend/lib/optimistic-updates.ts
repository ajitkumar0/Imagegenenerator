/**
 * Optimistic UI Updates
 *
 * Utilities for implementing optimistic updates
 * Show immediate feedback while waiting for API response
 */

import { useState, useCallback, useRef } from 'react';

// ============================================================================
// Optimistic Update Hook
// ============================================================================

interface UseOptimisticOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: unknown) => void;
  rollbackDelay?: number;
}

export function useOptimistic<T, TArgs extends any[]>(
  initialValue: T,
  asyncFn: (...args: TArgs) => Promise<T>,
  options: UseOptimisticOptions<T> = {}
) {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const previousValue = useRef<T>(initialValue);

  const execute = useCallback(
    async (optimisticValue: T, ...args: TArgs) => {
      // Store previous value for rollback
      previousValue.current = value;

      // Immediately update UI with optimistic value
      setValue(optimisticValue);
      setIsLoading(true);
      setError(null);

      try {
        // Execute async operation
        const result = await asyncFn(...args);

        // Update with actual result
        setValue(result);
        options.onSuccess?.(result);

        return result;
      } catch (err) {
        // Rollback to previous value on error
        if (options.rollbackDelay) {
          setTimeout(() => {
            setValue(previousValue.current);
          }, options.rollbackDelay);
        } else {
          setValue(previousValue.current);
        }

        setError(err);
        options.onError?.(err);

        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [value, asyncFn, options]
  );

  const reset = useCallback(() => {
    setValue(initialValue);
    setError(null);
    setIsLoading(false);
  }, [initialValue]);

  return {
    value,
    isLoading,
    error,
    execute,
    reset,
  };
}

// ============================================================================
// Optimistic List Operations
// ============================================================================

export class OptimisticList<T extends { id: string }> {
  private items: T[];
  private pendingOperations: Map<string, { type: 'add' | 'update' | 'delete'; item?: T }>;

  constructor(initialItems: T[] = []) {
    this.items = initialItems;
    this.pendingOperations = new Map();
  }

  // Get current items (including optimistic changes)
  getItems(): T[] {
    return this.items;
  }

  // Optimistically add item
  optimisticAdd(item: T): void {
    this.items = [...this.items, item];
    this.pendingOperations.set(item.id, { type: 'add', item });
  }

  // Confirm add operation
  confirmAdd(tempId: string, actualItem: T): void {
    const index = this.items.findIndex(i => i.id === tempId);
    if (index !== -1) {
      this.items[index] = actualItem;
    }
    this.pendingOperations.delete(tempId);
  }

  // Rollback add operation
  rollbackAdd(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
    this.pendingOperations.delete(id);
  }

  // Optimistically update item
  optimisticUpdate(id: string, updates: Partial<T>): void {
    const index = this.items.findIndex(i => i.id === id);
    if (index !== -1) {
      const oldItem = this.items[index];
      this.items[index] = { ...oldItem, ...updates };
      this.pendingOperations.set(id, { type: 'update', item: oldItem });
    }
  }

  // Confirm update operation
  confirmUpdate(id: string, actualItem: T): void {
    const index = this.items.findIndex(i => i.id === id);
    if (index !== -1) {
      this.items[index] = actualItem;
    }
    this.pendingOperations.delete(id);
  }

  // Rollback update operation
  rollbackUpdate(id: string): void {
    const operation = this.pendingOperations.get(id);
    if (operation?.type === 'update' && operation.item) {
      const index = this.items.findIndex(i => i.id === id);
      if (index !== -1) {
        this.items[index] = operation.item;
      }
    }
    this.pendingOperations.delete(id);
  }

  // Optimistically delete item
  optimisticDelete(id: string): void {
    const item = this.items.find(i => i.id === id);
    if (item) {
      this.items = this.items.filter(i => i.id !== id);
      this.pendingOperations.set(id, { type: 'delete', item });
    }
  }

  // Confirm delete operation
  confirmDelete(id: string): void {
    this.pendingOperations.delete(id);
  }

  // Rollback delete operation
  rollbackDelete(id: string): void {
    const operation = this.pendingOperations.get(id);
    if (operation?.type === 'delete' && operation.item) {
      this.items = [...this.items, operation.item];
    }
    this.pendingOperations.delete(id);
  }

  // Check if item has pending operation
  isPending(id: string): boolean {
    return this.pendingOperations.has(id);
  }

  // Get pending operation type
  getPendingOperation(id: string): 'add' | 'update' | 'delete' | null {
    return this.pendingOperations.get(id)?.type || null;
  }
}

// ============================================================================
// Optimistic Cache
// ============================================================================

export class OptimisticCache<T> {
  private cache: Map<string, T>;
  private pendingUpdates: Map<string, T>;

  constructor() {
    this.cache = new Map();
    this.pendingUpdates = new Map();
  }

  // Get value with optimistic updates
  get(key: string): T | undefined {
    return this.pendingUpdates.get(key) || this.cache.get(key);
  }

  // Set optimistic value
  setOptimistic(key: string, value: T): void {
    this.pendingUpdates.set(key, value);
  }

  // Confirm optimistic update
  confirm(key: string, actualValue: T): void {
    this.cache.set(key, actualValue);
    this.pendingUpdates.delete(key);
  }

  // Rollback optimistic update
  rollback(key: string): void {
    this.pendingUpdates.delete(key);
  }

  // Clear cache
  clear(): void {
    this.cache.clear();
    this.pendingUpdates.clear();
  }

  // Check if key has pending update
  isPending(key: string): boolean {
    return this.pendingUpdates.has(key);
  }
}

// ============================================================================
// Optimistic UI Helpers
// ============================================================================

export function generateTemporaryId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function isTemporaryId(id: string): boolean {
  return id.startsWith('temp_');
}

export function createOptimisticItem<T>(partial: Partial<T>): T {
  return {
    ...partial,
    id: generateTemporaryId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as T;
}

// ============================================================================
// Debounced Optimistic Updates
// ============================================================================

export function useDebouncedOptimistic<T>(
  initialValue: T,
  asyncFn: (value: T) => Promise<T>,
  delay: number = 500
) {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateValue = useCallback(
    (newValue: T) => {
      // Immediately update UI
      setValue(newValue);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout for API call
      timeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const result = await asyncFn(newValue);
          setValue(result);
        } catch (error) {
          console.error('Failed to save:', error);
          // Could show error toast here
        } finally {
          setIsLoading(false);
        }
      }, delay);
    },
    [asyncFn, delay]
  );

  return {
    value,
    isLoading,
    updateValue,
  };
}

// ============================================================================
// Example Usage Patterns
// ============================================================================

/*
// Example 1: Simple optimistic update
const { value: likes, execute: toggleLike } = useOptimistic(
  0,
  async (newValue: number) => {
    const response = await api.updateLikes(newValue);
    return response.likes;
  }
);

// In component:
<button onClick={() => toggleLike(likes + 1, postId)}>
  Like ({likes})
</button>

// Example 2: List operations
const list = new OptimisticList(initialItems);

// Add item optimistically
const tempId = generateTemporaryId();
const newItem = { id: tempId, name: 'New Item' };
list.optimisticAdd(newItem);

try {
  const savedItem = await api.createItem(newItem);
  list.confirmAdd(tempId, savedItem);
} catch (error) {
  list.rollbackAdd(tempId);
}

// Example 3: Debounced updates (auto-save)
const { value: content, updateValue } = useDebouncedOptimistic(
  '',
  async (newContent) => {
    return await api.saveContent(newContent);
  },
  1000
);

// In component:
<textarea
  value={content}
  onChange={(e) => updateValue(e.target.value)}
/>
{isLoading && <span>Saving...</span>}
*/
