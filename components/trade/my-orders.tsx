"use client";

import { useState } from "react";
import { useSession } from "@/components/providers";
import { dateOf, qty as fq, won } from "@/lib/format";

export function MyOrders({ symbol }: { symbol?: string }) {
  const { me, api, refresh, account } = useSession();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const orders = (me?.orders ?? []).filter((o) => !symbol || o.symbol === symbol);
  const fills = (me?.fills ?? []).filter((f) => !symbol || f.symbol === symbol);

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await api("/api/order/cancel", { method: "POST", body: JSON.stringify({ orderId: id }) });
      await refresh();
    } catch {
      // 이미 체결됐거나 취소된 경우
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-[var(--color-line)] px-2 py-1.5">
        {(
          [
            ["open", `미체결 ${orders.length}`],
            ["done", "체결 내역"],
          ] as ["open" | "done", string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded px-2.5 py-1 text-[12px] transition-colors ${
              tab === k
                ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                : "text-[var(--color-dim)] hover:text-[var(--color-mute)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!account ? (
          <p className="px-3 py-6 text-center text-[12px] text-[var(--color-dim)]">
            계좌를 열면 주문 내역이 여기 쌓입니다
          </p>
        ) : tab === "open" ? (
          orders.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--color-dim)]">
              걸어 둔 주문이 없습니다
            </p>
          ) : (
            orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2 text-[12px] last:border-0"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    o.side === "buy"
                      ? "bg-[color-mix(in_srgb,var(--color-up)_18%,transparent)] text-up"
                      : "bg-[color-mix(in_srgb,var(--color-down)_18%,transparent)] text-down"
                  }`}
                >
                  {o.side === "buy" ? "매수" : "매도"}
                </span>
                {!symbol && <span className="shrink-0 text-[var(--color-mute)]">{o.symbol}</span>}
                <span className="num">{won(o.price)}원</span>
                <span className="num text-[var(--color-mute)]">
                  {fq(o.qty - o.filledQty)}/{fq(o.qty)}주
                </span>
                <button
                  onClick={() => void cancel(o.id)}
                  disabled={busyId === o.id}
                  className="ml-auto shrink-0 rounded border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-mute)] hover:border-[var(--color-line2)] hover:text-[var(--color-ink)] disabled:opacity-50"
                >
                  {busyId === o.id ? "취소 중" : "취소"}
                </button>
              </div>
            ))
          )
        ) : fills.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-[var(--color-dim)]">
            체결 내역이 없습니다
          </p>
        ) : (
          fills.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2 text-[12px] last:border-0"
            >
              <span className={`shrink-0 font-semibold ${f.side === "buy" ? "text-up" : "text-down"}`}>
                {f.side === "buy" ? "매수" : "매도"}
              </span>
              {!symbol && <span className="shrink-0 text-[var(--color-mute)]">{f.symbol}</span>}
              <span className="num">{won(f.price)}원</span>
              <span className="num text-[var(--color-mute)]">{fq(f.qty)}주</span>
              <span className="num ml-auto shrink-0 text-[var(--color-dim)]">{dateOf(f.ts)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
