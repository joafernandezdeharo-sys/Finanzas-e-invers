import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData, CategoryRule, CollectionKey, ImportBatch, Settings, Transaction } from '../types';
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
  /** Agrega los movimientos de un resumen importado (se acumulan con los existentes) */
  importBatch: (batch: Omit<ImportBatch, 'id'>, txs: Omit<Transaction, 'id' | 'importId'>[], newRules: CategoryRule[]) => string;
  /** Borra un resumen importado y todos sus movimientos */
  removeImport: (id: string) => void;
  /** Borra la memoria de importaciones: todos los movimientos importados y el historial de archivos */
  clearImports: () => void;
  storageError: string | null;
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
    imports: arr(r.imports),
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
  const [storageError, setStorageError] = useState<string | null>(null);

  // pedimos al navegador que no borre los datos de la app aunque le falte espacio
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageError(null);
    } catch (e) {
      setStorageError(
        (e as Error).name === 'QuotaExceededError'
          ? 'El navegador se quedó sin espacio para guardar tus datos. Exportá un backup y borrá importaciones viejas.'
          : 'No se pudieron guardar los datos en este navegador (¿modo incógnito?).',
      );
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

  const importBatch = useCallback<Store['importBatch']>((batch, txs, newRules) => {
    const id = uid();
    setData((d) => {
      const rules = [...d.settings.categoryRules];
      for (const r of newRules) {
        const i = rules.findIndex((x) => x.keyword.toLowerCase() === r.keyword.toLowerCase());
        if (i >= 0) rules[i] = r; else rules.unshift(r);
      }
      // si el resumen trae categorías nuevas, las sumamos a la configuración
      const inc = new Set(d.settings.incomeCategories), exp = new Set(d.settings.expenseCategories);
      txs.forEach((t) => (t.type === 'ingreso' ? inc : exp).add(t.category));
      return {
        ...d,
        transactions: [...d.transactions, ...txs.map((t) => ({ ...t, id: uid(), importId: id }))],
        imports: [{ ...batch, id }, ...d.imports],
        settings: { ...d.settings, categoryRules: rules, incomeCategories: [...inc], expenseCategories: [...exp] },
      };
    });
    return id;
  }, []);

  const removeImport = useCallback((id: string) => {
    setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.importId !== id), imports: d.imports.filter((b) => b.id !== id) }));
  }, []);

  const clearImports = useCallback(() => {
    setData((d) => ({ ...d, transactions: d.transactions.filter((t) => !t.importId), imports: [] }));
  }, []);

  const replaceAll = useCallback((d: AppData) => setData(normalize(d)), []);
  const reset = useCallback(() => setData(emptyData()), []);

  const value = useMemo(
    () => ({ data, add, update, remove, setSettings, replaceAll, reset, importBatch, removeImport, clearImports, storageError }),
    [data, add, update, remove, setSettings, replaceAll, reset, importBatch, removeImport, clearImports, storageError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore fuera de AppStoreProvider');
  return s;
};

export const useSettings = () => useStore().data.settings;
