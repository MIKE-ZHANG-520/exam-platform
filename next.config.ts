import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 明确指向当前项目目录，避免 Turbopack/Next 因外层 /pnpm-lock.yaml 而误判工作区根路径
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
