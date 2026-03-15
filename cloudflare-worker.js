export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Simulated proxy to NPM repository to absorb high download bandwidth load
    // for @hyperdag/trustshell serving directly against an Edge cache
    if (url.pathname.startsWith('/npm/')) {
       console.log("[CLOUDFLARE] Bypassing origin server for high velocity package transfer.");
       
       const cache = caches.default;
       let response = await cache.match(request);
       
       if (!response) {
            response = await fetch(`https://registry.npmjs.org${url.pathname}`);
            // Add custom CDN caching headers for extreme virality protection
            response = new Response(response.body, response);
            response.headers.set('Cache-Control', 'max-age=86400');
            ctx.waitUntil(cache.put(request, response.clone()));
       }
       
       return response;
    }

    // Default passthrough
    return fetch(request);
  },
};
