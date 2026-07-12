import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "")).hostname
  : null;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    workerThreads: true,
    cpus: 1,
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "")).origin
      : "";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `img-src 'self' data: blob: ${supabaseOrigin}`,
      `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")} https://api.stripe.com`,
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src https://checkout.stripe.com https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      process.env.NODE_ENV === "production" ? "upgrade-insecure-requests" : "",
    ].filter(Boolean).join("; ");
    return [{ source:"/:path*", headers:[
      {key:"Content-Security-Policy",value:csp},
      {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"X-Frame-Options",value:"DENY"},
      {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.stripe.com\")"},
      {key:"Strict-Transport-Security",value:"max-age=63072000; includeSubDomains; preload"},
      {key:"Cross-Origin-Opener-Policy",value:"same-origin-allow-popups"},
      {key:"X-Robots-Tag",value:process.env.NEXT_PUBLIC_ALLOW_INDEXING==="true"?"index, follow":"noindex, nofollow, noarchive"},
    ]}];
  },
};

export default nextConfig;
