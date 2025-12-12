/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'localhost' },
      { protocol: 'https', hostname: 'zevy-phi.vercel.app' },
      { protocol: 'https', hostname: 'api.bfl.ml' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' }
    ],
    formats: ['image/webp', 'image/avif']
  },


  headers: async () => {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }
        ],
      },

    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  webpack: (config, { isServer }) => {
    // Suppress url.parse deprecation warnings
    if (isServer) {
      config.ignoreWarnings = [
        {
          module: /node_modules/,
          message: /DEP0169/,
        },
      ];
    }
    
    // Ensure proper URL polyfills
    config.resolve.fallback = {
      ...config.resolve.fallback,
      url: false,
      querystring: false,
    };
    
    return config;
  }
}

module.exports = nextConfig
// Remove any fallback for NEXT_PUBLIC_API_URL