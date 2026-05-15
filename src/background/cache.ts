interface Entry<T> {
  key: string;
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  dbName: string;
  storeName?: string;
  defaultTtlMs?: number;
}

export class Cache {
  private db: IDBDatabase | null = null;
  private openPromise: Promise<IDBDatabase> | null = null;
  private readonly storeName: string;
  private readonly defaultTtl: number;

  constructor(private opts: CacheOptions) {
    this.storeName = opts.storeName ?? "entries";
    this.defaultTtl = opts.defaultTtlMs ?? 6 * 60 * 60 * 1000; // 6h
  }

  /** Idempotent: safe to call concurrently and repeatedly. */
  async open(): Promise<void> {
    if (this.db) return;
    if (!this.openPromise) {
      this.openPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(this.opts.dbName, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(this.storeName, { keyPath: "key" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error(`cache open blocked: ${this.opts.dbName}`));
      });
    }
    this.db = await this.openPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    if (!this.db) await this.open();
    return this.db!.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get<T>(key: string): Promise<T | null> {
    const store = await this.tx("readonly");
    const entry = await new Promise<Entry<T> | undefined>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as Entry<T> | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      await this.invalidate(key);
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const entry: Entry<T> = { key, value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtl) };
    const store = await this.tx("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async invalidate(key: string): Promise<void> {
    const store = await this.tx("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const store = await this.tx("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
