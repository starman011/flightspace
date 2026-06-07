#!/usr/bin/env node
// Submit all sitemap URLs to IndexNow (Bing, DuckDuckGo, Yandex, etc.).
// Google does not use IndexNow, but these engines do — free, instant, unlimited.
// Usage: node scripts/indexnow-submit.mjs
//
// The key file MUST already be live at https://www.objecttracer.com/<KEY>.txt
// before running, or IndexNow rejects the submission.

const HOST = 'www.objecttracer.com'
const KEY = '71dfb0c5544b62bdccb3ed0949d6d9be'
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`
const SITEMAPS = [
  `https://${HOST}/sitemap.xml`,
  `https://${HOST}/sitemap-blog.xml`,
  `https://${HOST}/sitemap-launches.xml`,
]

async function urlsFromSitemap(url) {
  const res = await fetch(url)
  if (!res.ok) { console.warn(`! ${url} → HTTP ${res.status}`); return [] }
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
}

async function submitBatch(urlList) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  })
  return res.status
}

async function main() {
  const all = new Set()
  for (const sm of SITEMAPS) {
    const urls = await urlsFromSitemap(sm)
    urls.forEach(u => all.add(u))
    console.log(`  ${sm} → ${urls.length} urls`)
  }
  const urls = [...all]
  console.log(`\nTotal unique URLs: ${urls.length}`)

  // IndexNow accepts up to 10,000 URLs per request
  for (let i = 0; i < urls.length; i += 10000) {
    const batch = urls.slice(i, i + 10000)
    const status = await submitBatch(batch)
    console.log(`Batch ${i / 10000 + 1} (${batch.length} urls) → HTTP ${status} ${status === 200 || status === 202 ? '✅' : '⚠️'}`)
  }
  console.log('\nIndexNow submission complete. Bing/DuckDuckGo/Yandex will crawl these.')
}

main().catch(e => { console.error(e); process.exit(1) })
