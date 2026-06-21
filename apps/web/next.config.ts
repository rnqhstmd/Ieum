import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @ieum/crdt는 소스(TS)로 소비된다. P5부터 런타임 import(applyDocOp/diff 등)가 추가되어
  // webpack이 실제 모듈을 해석한다.
  transpilePackages: ['@ieum/crdt'],
  webpack: (config) => {
    // @ieum/crdt가 ESM 규약상 상대 import에 .js 확장자를 쓰므로(예: './wire.js'),
    // webpack이 이를 .ts 소스로 해석하도록 확장자 alias를 추가한다.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      ...config.resolve.extensionAlias,
    };
    return config;
  },
};

export default nextConfig;
