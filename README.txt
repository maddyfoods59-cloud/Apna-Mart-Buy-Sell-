APNA MART – FULL STACK

Includes:
- index.html frontend
- app.js online client
- Pages Function API (functions/api/[[path]].js)
- D1 schema (schema.sql)
- R2 image storage integration
- Email/password signup + login sessions
- Online ads, search, categories, favourites, seller contact, delete own ad

IMPORTANT DEPLOYMENT:
Cloudflare Pages Direct Upload does NOT support Pages Functions. Use Git integration or Wrangler.
1) Create a Cloudflare D1 database named apna-mart-db.
2) Create an R2 bucket named apna-mart-images.
3) Run schema.sql on the D1 database.
4) Put your D1 database ID in wrangler.json.
5) Deploy this project through Cloudflare Pages connected to Git, or Wrangler.
6) In Pages Settings > Bindings, bind D1 as DB and R2 as IMAGES, then redeploy.

Never publish a D1 ID as a secret; the ID itself is not a password. Keep passwords/session secrets server-side.
