import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData, CollectionKey, Settings } from '../types';
import { DEFAULT_SETTINGS, emptyData } from '../lib/defaults';
import { uid } from '../lib/util';

const STORAGE_KEY = 'mis-finanzas:data:v1';

type Item<K extends CollectionKey> = AppData[K][number];

interface Store {
  data: AppData;
  add: <K extends CollectionKey>(key: K, item: Omit<Item<K>, 'id'>) => void;
  update: <K extends CollectionKey>(key: K, id: string, patch: Partial<Item<K>>) => void;
  remove: (key: CollectionKey, id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  replaceAll: (data: AppData) => void;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

/** Normaliza datos importados / guardados con versiones anteriores */
export const normalize = (raw: unknown): AppData => {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    version: 1,
    transactions: arr(r.transactions),
    goals: arr(r.goals),
    savings: arr(r.savings),
    dollarOps: arr(r.dollarOps),
    investments: arr(r.investments),
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
  };
};

const load = (): AppData => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? normalize(JSON.parse(s)) : emptyData();
  } catch {
    return emptyData();
  }
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [data]);

  const add = useCallback<Store['add']>((key, item) => {
    setData((d) => ({ ...d, [key]: [...d[key], { ...item, id: uid() }] }));
  }, []);

  const update = useCallback<Store['update']>((key, id, patch) => {
    setData((d) => ({
      ...d,
      [key]: (d[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }, []);

  const remove = useCallback<Store['remove']>((key, id) => {
    setData((d) => {
      const next = { ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) };
      // al borrar una meta, sus aportes pasan a "ahorro general"
      if (key === 'goals') next.savings = d.savings.map((s) => (s.goalId === id ? { ...s, goalId: '' } : s));
      return next as AppData;
    });
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const replaceAll = useCallback((d: AppData) => setData(normalize(d)), []);
  const reset = useCallback(() => setData(emptyData()), []);

  const value = useMemo(
    () => ({ data, add, update, remove, setSettings, replaceAll, reset }),
    [data, add, update, remove, setSettings, replaceAll, reset],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore fuera de AppStoreProvider');
  return s;
};

export const useSettings = () => useStore().data.settings;
