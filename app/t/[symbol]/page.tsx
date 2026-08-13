import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TradeScreen } from "@/components/trade/trade-screen";
import { eok, won } from "@/lib/format";
import { getAsset, getAssets, lastRealPrice, nav } from "@/lib/market";

export function generateStaticParams() {
  return getAssets().map((a) => ({ symbol: a.symbol }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const asset = getAsset(symbol);
  if (!asset) return { title: "없는 종목 — 집값거래소" };
  return {
    title: `${asset.name} — 집값거래소`,
    description: `${asset.region} · 한 채 ${eok(lastRealPrice(asset))} · 한 주 ${won(
      nav(asset, Date.now())
    )}원`,
  };
}

export default async function TradePage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const asset = getAsset(symbol);
  if (!asset) notFound();
  return <TradeScreen asset={asset} />;
}
