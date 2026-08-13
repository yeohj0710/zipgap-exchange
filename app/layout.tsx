import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "집값거래소 — 전국 부동산을 주식처럼",
  description:
    "은마아파트 한 채를 10만분의 1로 쪼개 사고팝니다. 실거래가를 따라가는 값에 사람들의 주문이 얹혀 시장가격이 만들어집니다.",
  openGraph: {
    title: "집값거래소",
    description: "전국 부동산을 주식처럼 사고파는 모의 거래소",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0d12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-[1400px] px-3 pb-24 sm:px-5">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
