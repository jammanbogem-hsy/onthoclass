import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 워크스페이스 루트를 이 프로젝트로 고정 (상위 lockfile 오인 방지)
  turbopack: {
    root: __dirname,
  },
  // Firebase Hosting 정적 배포용 (SSR 없이 클라이언트 렌더링)
  output: "export",
  images: {
    unoptimized: true,
  },
  // 정적 호스팅에서 경로 일관성을 위해 trailing slash 사용
  trailingSlash: true,
};

export default nextConfig;
