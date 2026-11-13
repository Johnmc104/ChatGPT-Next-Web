import webpack from "webpack";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const disableChunk = !!process.env.DISABLE_CHUNK;
console.log("[Next] build with chunk: ", !disableChunk);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    if (disableChunk) {
      config.plugins.push(
        new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      );
    }

    config.resolve.fallback = {
      child_process: false,
    };

    // Ignore optional WebSocket native modules (used by rt-client / ws)
    // These are not needed in browser or serverless environments
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(bufferutil|utf-8-validate)$/,
      }),
    );

    return config;
  },
  output: "standalone",
  experimental: {
    // Optimize barrel re-exports for these packages to reduce bundle size.
    // Next.js SWC will tree-shake unused exports at the module level.
    optimizePackageImports: [
      "lodash-es",
      "emoji-picker-react",
      "react-router-dom",
      "mermaid",
    ],
  },
};

const corsOrigin = process.env.CORS_ALLOW_ORIGIN ?? "*";

const CorsHeaders = [
  { key: "Access-Control-Allow-Credentials", value: "true" },
  { key: "Access-Control-Allow-Origin", value: corsOrigin },
  {
    key: "Access-Control-Allow-Methods",
    value: "*",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "*",
  },
  {
    key: "Access-Control-Max-Age",
    value: "86400",
  },
];

nextConfig.headers = async () => {
  return [
    {
      source: "/api/:path*",
      headers: CorsHeaders,
    },
  ];
};

nextConfig.rewrites = async () => {
  // Only fixed, non-API destinations are rewritten here. Model API
  // traffic must go through app/api routes so it is authenticated.
  const ret = [
    {
      source: "/google-fonts/:path*",
      destination: "https://fonts.googleapis.com/:path*",
    },
  ];

  return {
    beforeFiles: ret,
  };
};

export default withBundleAnalyzer(nextConfig);
