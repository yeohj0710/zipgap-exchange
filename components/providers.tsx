"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import {
  FIREBASE_READY,
  fbAuth,
  fbDb,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "@/lib/firebase-client";
import { getAssets } from "@/lib/market";
import { quoteOf, type Quote } from "@/lib/quote";
import { emptyBook, type BookState } from "@/lib/store/types";
import type { Account, Order } from "@/lib/types";

const TOKEN_KEY = "zipgap.token";

// ── 세션 ──────────────────────────────────────────────────────────

export interface HoldingView {
  symbol: string;
  name: string;
  qty: number;
  locked: number;
  avgPrice: number;
  price: number;
  value: number;
  pnl: number;
  pnlRate: number;
}

interface MeData {
  account: Account;
  holdings: HoldingView[];
  orders: Order[];
  fills: {
    id: string;
    symbol: string;
    side: "buy" | "sell";
    price: number;
    qty: number;
    amount: number;
    fee: number;
    taker: boolean;
    ts: number;
  }[];
  equity: number;
  holdingValue: number;
  dividendPaid: number;
}

interface SessionValue {
  ready: boolean;
  live: boolean;
  account: Account | null;
  me: MeData | null;
  needsLogin: boolean;
  busy: boolean;
  openAccount: () => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  setNick: (nick: string) => Promise<void>;
}

const SessionCtx = createContext<SessionValue | null>(null);

export function useSession() {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("SessionProvider 안에서만 쓸 수 있습니다.");
  return v;
}

function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const live = FIREBASE_READY;

  const getToken = useCallback(async (): Promise<string | null> => {
    if (live) {
      const auth = fbAuth();
      const u = auth?.currentUser;
      if (!u) return null;
      return u.getIdToken();
    }
    return tokenRef.current;
  }, [live]);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      const json = await res.json().catch(() => ({ ok: false, message: "응답을 읽지 못했습니다." }));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.message ?? "요청이 실패했습니다.");
      }
      return json as T;
    },
    [getToken]
  );

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const data = await api<{ ok: true } & MeData>("/api/me");
      setMe(data);
      setAccount(data.account);
    } catch {
      setMe(null);
    }
  }, [api, getToken]);

  /** 세션을 서버에 알리고 계정을 확보한다 */
  const sync = useCallback(async () => {
    try {
      const data = await api<{ account: Account | null; token: string | null; needsLogin?: boolean }>(
        "/api/session",
        { method: "POST", body: JSON.stringify({}) }
      );
      if (data.token) {
        tokenRef.current = data.token;
        try {
          localStorage.setItem(TOKEN_KEY, data.token);
        } catch {}
      }
      if (data.account) {
        setAccount(data.account);
        setNeedsLogin(false);
        await refresh();
      } else {
        setNeedsLogin(Boolean(data.needsLogin));
      }
    } catch {
      setNeedsLogin(true);
    }
  }, [api, refresh]);

  // 처음 뜰 때
  useEffect(() => {
    let alive = true;
    (async () => {
      if (live) {
        const auth = fbAuth();
        if (!auth) {
          setReady(true);
          return;
        }
        onAuthStateChanged(auth, async (u) => {
          if (!alive) return;
          if (u) {
            await sync();
          } else {
            setAccount(null);
            setMe(null);
            setNeedsLogin(true);
          }
          setReady(true);
        });
      } else {
        try {
          tokenRef.current = localStorage.getItem(TOKEN_KEY);
        } catch {}
        await sync();
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const openAccount = useCallback(async () => {
    setBusy(true);
    try {
      if (live) {
        const auth = fbAuth();
        if (auth) await signInAnonymously(auth);
      } else {
        tokenRef.current = null;
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {}
        await sync();
      }
    } finally {
      setBusy(false);
    }
  }, [live, sync]);

  const loginGoogle = useCallback(async () => {
    setBusy(true);
    try {
      const auth = fbAuth();
      if (auth) await signInWithPopup(auth, new GoogleAuthProvider());
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (live) {
      const auth = fbAuth();
      if (auth) await signOut(auth);
    } else {
      tokenRef.current = null;
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
      setAccount(null);
      setMe(null);
      setNeedsLogin(true);
    }
  }, [live]);

  const setNick = useCallback(
    async (nick: string) => {
      const data = await api<{ account: Account }>("/api/nick", {
        method: "POST",
        body: JSON.stringify({ nick }),
      });
      setAccount(data.account);
      await refresh();
    },
    [api, refresh]
  );

  // 30초마다 내 계좌를 새로 읽는다
  useEffect(() => {
    if (!account) return;
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [account, refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      live,
      account,
      me,
      needsLogin,
      busy,
      openAccount,
      loginGoogle,
      logout,
      refresh,
      api,
      setNick,
    }),
    [ready, live, account, me, needsLogin, busy, openAccount, loginGoogle, logout, refresh, api, setNick]
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

// ── 시세 ──────────────────────────────────────────────────────────

interface MarketValue {
  now: number;
  /** 브라우저에서 시계가 돌기 시작했는지. 서버에서 그린 값과 어긋나지 않게 하려고 쓴다 */
  mounted: boolean;
  books: Record<string, BookState>;
  quotes: Record<string, Quote>;
  connected: boolean;
}

const MarketCtx = createContext<MarketValue | null>(null);

export function useMarket() {
  const v = useContext(MarketCtx);
  if (!v) throw new Error("MarketProvider 안에서만 쓸 수 있습니다.");
  return v;
}

function defaultBooks(now: number): Record<string, BookState> {
  const out: Record<string, BookState> = {};
  for (const a of getAssets()) out[a.symbol] = emptyBook(a.symbol, now);
  return out;
}

function MarketProvider({ children }: { children: React.ReactNode }) {
  // 값은 시각에 따라 계속 바뀐다. 서버에서 미리 그려 두면 브라우저가 받은 값과
  // 어긋나므로, 시계는 브라우저에 붙은 다음에야 돌린다.
  const [now, setNow] = useState(0);
  const [books, setBooks] = useState<Record<string, BookState>>(() => defaultBooks(0));
  const [connected, setConnected] = useState(false);

  // 마켓메이커 값은 시각만으로 움직인다. 1초마다 시계를 밀어 준다
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const db = fbDb();
    if (db) {
      const unsub = onSnapshot(
        collection(db, "books"),
        (snap) => {
          setConnected(true);
          setBooks((prev) => {
            const next = { ...prev };
            for (const d of snap.docs) {
              next[d.id] = { ...emptyBook(d.id, Date.now()), ...(d.data() as BookState) };
            }
            return next;
          });
        },
        () => setConnected(false)
      );
      return () => unsub();
    }

    // Firestore 를 안 붙였으면 주기적으로 받아 온다
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        const json = await res.json();
        if (!alive || !json?.ok) return;
        setBooks((prev) => ({ ...prev, ...json.books }));
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };
    void pull();
    const id = setInterval(pull, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const quotes = useMemo(() => {
    const out: Record<string, Quote> = {};
    if (!now) return out;
    for (const a of getAssets()) {
      out[a.symbol] = quoteOf(a, books[a.symbol] ?? emptyBook(a.symbol, now), now);
    }
    return out;
  }, [books, now]);

  const value = useMemo<MarketValue>(
    () => ({ now, mounted: now > 0, books, quotes, connected }),
    [now, books, quotes, connected]
  );

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

/** 한 종목만 볼 때는 그 문서만 구독한다 */
export function useSymbolBook(symbol: string): BookState {
  const { books } = useMarket();
  const [live, setLive] = useState<BookState | null>(null);

  useEffect(() => {
    const db = fbDb();
    if (!db) return;
    const unsub = onSnapshot(doc(db, "books", symbol), (snap) => {
      if (snap.exists()) {
        setLive({ ...emptyBook(symbol, Date.now()), ...(snap.data() as BookState) });
      }
    });
    return () => unsub();
  }, [symbol]);

  const fallback = useMemo(() => emptyBook(symbol, 0), [symbol]);
  return live ?? books[symbol] ?? fallback;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MarketProvider>{children}</MarketProvider>
    </SessionProvider>
  );
}
