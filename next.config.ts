import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin 은 번들에 말아 넣지 않고 그대로 둔다.
  // 안에서 네이티브·조건부 로딩을 써서 번들러가 건드리면 깨진다.
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "google-gax"],
};

export default nextConfig;
