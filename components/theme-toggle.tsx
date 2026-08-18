"use client";

import { useEffect, useState } from "react";

/**
 * 밝은 화면과 어두운 화면을 바꾼다. 고른 값은 이 브라우저에만 남는다.
 * 첫 페인트 전 입히는 일은 layout.tsx 의 THEME_BOOT 가 맡는다 — 여기서 하면 번쩍인다.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // 서버에서 그린 값과 브라우저가 아는 값이 다를 수 있어 붙은 뒤에 맞춘다.
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const flip = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("zipgap.theme", next ? "dark" : "light");
    } catch {
      // 사생활 보호 모드면 저장이 막힌다. 이번 화면만 바뀌고 끝난다.
    }
  };

  return (
    <button
      onClick={flip}
      aria-label={dark ? "밝은 화면으로" : "어두운 화면으로"}
      title={dark ? "밝은 화면으로" : "어두운 화면으로"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] text-[14px] text-[var(--color-mute)] transition-colors hover:border-[var(--color-line2)] hover:text-[var(--color-ink)]"
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
