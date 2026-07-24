import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@pith-cms/core',
    '@pith-cms/next',
    '@pith-cms/storage-filesystem',
    '@pith-cms/storage-github',
  ],
};

export default nextConfig;
