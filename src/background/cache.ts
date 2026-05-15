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
  private readonly storeName: string;
  private readonly defaultTtl: number;

  constructor(private opts: CacheOptions) {
    this.storeName = opts.storeName ?? "entries";
    this.defaultTtl = opts.defaultTtlMs ?? 6 * 60 * 60 * 1000; // 6h
  }

  async open(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.opts.dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error(`cache open blocked: ${this.opts.dbName}`));
    });
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error("cache not opened");
    return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = await new Promise<Entry<T> | undefined>((resolve, reject) => {
      const req = this.tx("readonly").get(key);
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
    await new Promise<void>((resolve, reject) => {
      const req = this.tx("readwrite").put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async invalidate(key: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx("readwrite").delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx("readwrite").clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
