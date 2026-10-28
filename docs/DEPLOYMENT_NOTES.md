# Deployment notes

Requirements found while building, to apply on any hosted environment.

| Item | Why | Found in |
| --- | --- | --- |
| Enable gzip or brotli on the API gateway (Kong or the reverse proxy in front of Supabase) for `application/json` | NFR-02: `map_assets` for 10,000 points is 596 KB uncompressed and 93 KB gzipped. Measured map open with 10,000 points: 1.4 s on 4G (12 Mbit/s, 70 ms) uncompressed; 2.9 s on slow 4G (4 Mbit/s, 150 ms) uncompressed, which needs compression to reach 2 s. Local `supabase start` does not compress. | Task 1.2 |
| Restrict `VITE_GOOGLE_MAPS_API_KEY` by HTTP referrer and enable only the Map Tiles API | The key is shipped to the browser | Task 1.2 |
| Do not cache Google satellite tiles in the service worker | Google Maps Platform terms | Task 1.2, affects 2.8 |
