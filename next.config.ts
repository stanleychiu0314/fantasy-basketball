import type { NextConfig } from "next";

// Cache Components is off: every page reads live scores per request, and the
// app relies on route segment config (dynamic = "force-dynamic") instead.
const nextConfig: NextConfig = {};

export default nextConfig;
