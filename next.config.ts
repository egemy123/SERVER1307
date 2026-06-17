import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  // Disable Turbopack — use webpack for Tailwind v3 compatibility
 
}

export default nextConfig