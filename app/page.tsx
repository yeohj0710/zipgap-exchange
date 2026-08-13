import { MarketTable } from "@/components/market-table";
import { MarketBanner } from "@/components/market-banner";
import { getAssets, LISTINGS_STATUS, LISTINGS_VERSION } from "@/lib/market";

export default function Home() {
  const total = getAssets().length;
  const complexes = getAssets().filter((a) => a.kind === "complex").length;

  return (
    <div className="pt-5">
      <section className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight sm:text-[26px]">
          전국의 집을 10만분의 1로 쪼개 사고팝니다
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[var(--color-mute)]">
          은마아파트 한 채가 28억이면 한 주는 28,000원입니다. 실거래가가 오르면 주가도 오르고,
          사려는 사람이 몰리면 실거래가보다 비싸집니다. 지금 {total}개 종목이 열려 있고 그중{" "}
          {complexes}개가 실제 단지입니다.
        </p>
      </section>

      <MarketBanner version={LISTINGS_VERSION} status={LISTINGS_STATUS} />
      <MarketTable />
    </div>
  );
}
