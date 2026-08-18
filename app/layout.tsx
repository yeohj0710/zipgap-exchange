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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1319" },
  ],
  width: "device-width",
  initialScale: 1,
};

/* 첫 페인트 전에 골라 둔 화면을 입힌다. 리액트가 붙은 뒤에 바꾸면 밝은 화면이
   한 번 번쩍이고 어두워진다. 기본값은 밝은 쪽이다. */
const THEME_BOOT = `try{var t=localStorage.getItem('zipgap.theme');if(t==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // THEME_BOOT 이 리액트가 붙기 전에 data-theme 을 얹으므로 서버가 그린 html 태그와
    // 달라진다. suppressHydrationWarning 으로 이 태그 하나만 다름을 눈감아 준다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
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
