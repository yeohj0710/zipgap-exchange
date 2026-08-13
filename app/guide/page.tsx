import Link from "next/link";
import { MM, RULES } from "@/lib/config";
import { getAssets } from "@/lib/market";
import { won } from "@/lib/format";

export const metadata = { title: "거래 규칙 — 집값거래소" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--color-line)] py-6 first:border-0 first:pt-0">
      <h2 className="mb-2.5 text-[16px] font-bold tracking-tight">{title}</h2>
      <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--color-mute)]">
        {children}
      </div>
    </section>
  );
}

export default function GuidePage() {
  const n = getAssets().length;

  return (
    <div className="mx-auto max-w-2xl pt-5">
      <h1 className="text-[22px] font-bold tracking-tight">거래 규칙</h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--color-mute)]">
        진짜 돈은 하나도 오가지 않습니다. 부동산 값이 어떻게 움직이는지 몸으로 익히는 곳입니다
      </p>

      <div className="mt-6">
        <Section title="한 주가 무엇인지">
          <p>
            집 한 채를 10만 조각으로 쪼갠 것이 한 주입니다. 은마아파트 한 채가 28억이면 한 주는
            28,000원입니다. 28억을 10만으로 나눈 값입니다.
          </p>
          <p>
            지금 {n}개 종목을 열어 뒀습니다. 실제 단지도 있고, 서울 아파트나 강남3구처럼 여러 집을
            묶은 지수도 있습니다.
          </p>
        </Section>

        <Section title="값이 정해지는 방법">
          <p>
            바탕에는 국토부 실거래가가 깔립니다. 이 값을 실거래가라고 부르고, 차트에서 점선으로
            그립니다. 실거래가는 한 달에 한 번 바뀝니다.
          </p>
          <p>
            그 위에 사람들의 주문이 얹힙니다. 사려는 사람이 몰리면 값이 실거래가보다 높아지고, 팔려는
            사람이 몰리면 낮아집니다. 이 차이를 <span className="text-[var(--color-ink)]">실거래가 대비</span>
            로 보여 줍니다. 주식시장에서 말하는 괴리율과 같습니다.
          </p>
          <p>
            아무도 거래하지 않을 때는 시장조성자가 실거래가 둘레에{" "}
            {(MM.SPREAD * 200).toFixed(2)}% 폭으로 사고팔 값을 걸어 둡니다. 그래서 혼자 들어와도 바로
            거래할 수 있습니다. 다만 물량이 무한하지는 않습니다. 사람들이 계속 사가면 시장조성자
            재고가 바닥나면서 값이 최대 {(MM.SKEW * 100).toFixed(0)}%까지 밀려 올라갑니다.
          </p>
        </Section>

        <Section title="주문 넣는 법">
          <p>
            <span className="text-[var(--color-ink)]">지정가</span>는 원하는 값을 적어 거는 주문입니다.
            그 값에 맞는 상대가 나타날 때까지 호가창에 남습니다.{" "}
            <span className="text-[var(--color-ink)]">시장가</span>는 지금 나와 있는 호가를 위에서부터
            바로 집어 가는 주문입니다.
          </p>
          <p>
            매수 주문을 걸면 그만큼 예수금이 잠깁니다. 매도 주문을 걸면 그만큼 주식이 잠깁니다.
            취소하면 전액 돌아옵니다. 같은 값에 사람 주문과 시장조성자 물량이 함께 있으면 사람
            주문부터 체결합니다.
          </p>
          <p>
            수수료는 사고팔 때 각각 {(RULES.FEE_RATE * 100).toFixed(3)}%입니다. 현재가에서{" "}
            {Math.round(RULES.PRICE_BAND * 100)}% 넘게 벗어난 값은 주문이 막힙니다.
          </p>
        </Section>

        <Section title="월세">
          <p>
            집을 갖고 있으면 월세가 들어옵니다. 종목마다 정해 둔 임대수익률을 열두 달로 나눠 매달
            예수금에 넣어 줍니다. 서울 아파트는 연 2% 안팎, 지방은 3%대입니다. 자산 화면을 열 때
            밀린 달을 한꺼번에 계산해 지급합니다.
          </p>
        </Section>

        <Section title="계좌">
          <p>
            계좌를 열면 {won(RULES.SEED_CASH)}원을 드립니다. 이름만 정하면 끝이고, 따로 가입하지
            않아도 됩니다. 구글 계정을 연결하면 다른 기기에서도 같은 계좌를 씁니다.
          </p>
          <p>
            랭킹은 넣은 돈 대비 수익률로 매깁니다. 계좌를 새로 열어도 수익률은 0에서 시작하니 이득이
            없습니다.
          </p>
        </Section>

        <Section title="이 값을 믿으면 안 되는 이유">
          <p>
            여기 값은 투자 판단에 쓰라고 만든 것이 아닙니다. 실거래가를 바탕에 깔았을 뿐, 실제
            아파트를 이 값에 사고팔 수 있다는 뜻이 아닙니다. 취득세, 보유세, 양도세, 중개수수료,
            대출이자를 하나도 넣지 않았습니다.
          </p>
          <p>
            지금은 실거래가 원자료를 아직 안 붙였습니다. 표본값으로 돌아가고 있고, 원자료를 붙이는
            대로 바꿉니다.
          </p>
        </Section>
      </div>

      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13.5px] font-semibold text-black hover:brightness-110"
      >
        시장 보러 가기
      </Link>
    </div>
  );
}
