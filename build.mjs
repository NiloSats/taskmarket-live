// build.mjs: fetches Taskmarket's public API on the server side and writes dist/ (static site + data.json).
// Node 20+, no dependencies. Run: node build.mjs
// Every number on the page comes from the endpoints listed in ENDPOINTS below; derived numbers are computed
// here from /api/tasks and the exact rule is written next to each one (and in the page's methods note).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.TASKMARKET_API || 'https://api.taskmarket.dev'
const UA = { 'User-Agent': 'taskmarket-live-viz (open source; github.com/NiloSats/taskmarket-live)', Accept: 'application/json' }
const CHAINS = [
  { id: 4217, name: 'Tempo', token: 'OUSD' },
  { id: 8453, name: 'Base', token: 'USDC' },
]
const SITE = (process.env.SITE_URL || '').replace(/\/?$/, '/') // absolute base for share images
const RANGES = ['7d', '30d', '90d', 'all']
const DEC = 1e6 // rewards are 6-decimal stablecoin base units (USDC on Base, OUSD on Tempo)

async function get(p, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(API + p, { headers: UA, signal: AbortSignal.timeout(60000) })
      if (!r.ok) throw new Error(`${r.status} ${p}`)
      return await r.json()
    } catch (e) {
      if (i >= tries) throw e
      await new Promise((s) => setTimeout(s, 1500 * i))
    }
  }
}

async function allTasks(chainId) {
  const out = []
  let cursor = null
  for (let page = 0; page < 200; page++) {
    const d = await get(`/api/tasks?chainId=${chainId}&sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    for (const t of d.tasks) {
      out.push({
        id: t.id, chainId: t.chainId, requester: (t.requester || '').toLowerCase(), reward: Number(t.reward || 0) / DEC,
        createdAt: t.createdAt, status: t.status, mode: t.mode, submissions: t.submissionCount || 0,
        awards: t.awardCount || 0, winner: t.primaryAward?.workerAddress?.toLowerCase() || null,
        title: String(t.description || '').split('\n')[0].slice(0, 120),
      })
    }
    if (!d.hasMore) break
    cursor = d.nextCursor
  }
  return out
}

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n
const isoWeek = (iso) => { // Monday (UTC) of the week, YYYY-MM-DD
  const d = new Date(iso); const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10)
}
const countBy = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {})

function derive(tasks) {
  // Distinct task posters per week: unique `requester` addresses among tasks whose createdAt falls in that
  // UTC week (Monday start).
  const weeks = {}
  for (const t of tasks) (weeks[isoWeek(t.createdAt)] ||= new Set()).add(t.requester)
  const postersPerWeek = Object.entries(weeks).sort().map(([week, s]) => ({ week, posters: s.size }))

  // Posting concentration: share of all posted reward held by the top 1 and top 5 requesters.
  const byReq = {}
  for (const t of tasks) byReq[t.requester] = (byReq[t.requester] || 0) + t.reward
  const totalPosted = Object.values(byReq).reduce((a, b) => a + b, 0)
  const ranked = Object.entries(byReq).sort((a, b) => b[1] - a[1])
  const top = (n) => ranked.slice(0, n).reduce((a, [, v]) => a + v, 0)

  // Money flow: completed tasks with exactly one award, reward from requester to the primary award's
  // worker. Multi-award tasks are shown as one bucket because the API does not give the split.
  const single = tasks.filter((t) => t.status === 'completed' && t.awards === 1 && t.winner)
  const multi = tasks.filter((t) => t.status === 'completed' && t.awards > 1)
  const N = 6
  const sum = (xs, k) => xs.reduce((m, t) => ((m[t[k]] = (m[t[k]] || 0) + t.reward), m), {})
  const topKeys = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, N).map(([k]) => k)
  const pTop = new Set(topKeys(sum(single, 'requester'))); const wTop = new Set(topKeys(sum(single, 'winner')))
  const links = {}
  for (const t of single) {
    const s = pTop.has(t.requester) ? t.requester : 'other posters'
    const w = wTop.has(t.winner) ? t.winner : 'other winners'
    const k = s + '|' + w; links[k] = (links[k] || 0) + t.reward
  }
  const flow = {
    links: Object.entries(links).map(([k, v]) => { const [s, w] = k.split('|'); return { s, w, v: round(v) } }).sort((a, b) => b.v - a.v),
    singleTasks: single.length, singleValue: round(single.reduce((a, t) => a + t.reward, 0)),
    multiTasks: multi.length, multiValue: round(multi.reduce((a, t) => a + t.reward, 0)),
    distinctWinners: new Set(single.map((t) => t.winner)).size,
  }

  // Tasks that ended without a result: status expired or cancelled, by mode.
  const dead = {}
  for (const t of tasks) {
    const d = (dead[t.mode] ||= { total: 0, expired: 0, cancelled: 0, completed: 0 })
    d.total++; if (t.status in d) d[t.status]++
  }
  // Submissions per finished bounty: median count on completed bounty tasks (how crowded a win is).
  const subs = tasks.filter((t) => t.mode === 'bounty' && t.status === 'completed').map((t) => t.submissions).sort((a, b) => a - b)
  const median = (xs) => (xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null)
  const rewards = tasks.map((t) => t.reward).sort((a, b) => a - b)

  return {
    taskCount: tasks.length,
    byStatus: countBy(tasks, (t) => t.status),
    byMode: countBy(tasks, (t) => t.mode),
    postedTotal: round(totalPosted),
    distinctPosters: ranked.length,
    top1Share: totalPosted ? round(top(1) / totalPosted, 4) : 0,
    top5Share: totalPosted ? round(top(5) / totalPosted, 4) : 0,
    topPosters: ranked.slice(0, 5).map(([a, v]) => ({ a: short(a), v: round(v) })),
    postersPerWeek, flow, dead,
    medianSubmissionsPerWonBounty: median(subs),
    medianReward: median(rewards),
    firstTask: tasks.length ? tasks[tasks.length - 1].createdAt : null,
  }
}

async function main() {
  const asOf = new Date().toISOString()
  const data = { asOf, api: API, chains: {}, platform: {} }
  for (const c of CHAINS) {
    const [stats, tasks] = await Promise.all([get(`/api/market/stats?chainId=${c.id}`), allTasks(c.id)])
    const d = derive(tasks)
    // flow labels: shorten addresses but keep bucket names
    d.flow.links = d.flow.links.map((l) => ({ ...l, s: l.s.startsWith('0x') ? short(l.s) : l.s, w: l.w.startsWith('0x') ? short(l.w) : l.w }))
    data.chains[c.id] = { ...c, stats, ...d }
  }
  // Platform endpoints. Checked 24-nov-2026: these return identical bodies for chainId=4217 and 8453 (and
  // reject chains not served), so they are shown once, labelled "platform-wide, as served".
  const cid = CHAINS[0].id
  data.platform.breakdowns = await get(`/api/stats/breakdowns?chainId=${cid}`)
  data.platform.series = {}
  for (const r of RANGES) {
    const bucket = r === 'all' || r === '90d' ? 'week' : 'day'
    data.platform.series[r] = { bucket, rows: (await get(`/api/stats/platform-time-series?chainId=${cid}&range=${r}&bucket=${bucket}`)).map((x) => ({
      t: x.bucket, active: x.activeAgents, tasks: x.tasksCreated, posted: round(Number(x.rewardVolume) / DEC), paid: round(Number(x.paidVolume) / DEC),
      completed: x.completedTasks, newAgents: x.newAgents,
    })) }
  }
  const hm = await get(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=hourOfWeek`)
  data.platform.heatmap = { range: '30d', max: hm.maxCount, cells: hm.cells.map((c) => [Number(c.row), Number(c.col), c.count]) }
  const feed = await get(`/api/stats/activity-feed?chainId=${cid}&limit=40`)
  data.platform.feed = feed.items.map((i) => ({ type: i.type, ts: i.timestamp, title: i.taskTitle, chain: i.chainId, actorType: i.actorType, amount: i.amount, task: i.taskId }))
  data.endpoints = [
    '/api/market/stats?chainId=4217|8453', '/api/tasks?chainId=4217|8453&sort=newest&limit=100&cursor=…',
    '/api/stats/breakdowns', '/api/stats/platform-time-series?range=7d|30d|90d|all&bucket=day|week',
    '/api/stats/activity-heatmap?range=30d&dimension=hourOfWeek', '/api/stats/activity-feed?limit=40',
  ]

  const dist = path.join(here, 'dist')
  fs.mkdirSync(dist, { recursive: true })
  for (const f of fs.readdirSync(dist)) fs.rmSync(path.join(dist, f), { recursive: true, force: true })
  fs.cpSync(path.join(here, 'src'), dist, { recursive: true })
  fs.writeFileSync(path.join(dist, 'data.json'), JSON.stringify(data))
  // stamp the build time into the HTML so the "data as of" is visible even before JS runs
  const html = path.join(dist, 'index.html')
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replaceAll('__AS_OF__', asOf).replaceAll('__SITE__', SITE === '/' ? '' : SITE))
  // One small page per view so each shared link gets its own card (og/<view>.png, drawn by og.py), then
  // forwards to that section of the main page.
  const views = { flow: 'Where the money goes', trends: 'The market over time', modes: 'How tasks end, by mode', heatmap: 'When the market is busy', posters: 'Who posts the work' }
  fs.mkdirSync(path.join(dist, 'v'), { recursive: true })
  for (const [v, t] of Object.entries(views)) {
    fs.writeFileSync(path.join(dist, 'v', `${v}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Taskmarket, live: ${t}</title>
<meta property="og:title" content="Taskmarket, live: ${t}"><meta property="og:description" content="Live view of Taskmarket's public market data. Data as of ${asOf}.">
<meta property="og:image" content="${SITE === '/' ? '../' : SITE}og/${v}.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE === '/' ? '../' : SITE}og/${v}.png">
<meta http-equiv="refresh" content="0; url=../#${v}"><link rel="canonical" href="../#${v}"></head><body><a href="../#${v}">${t}</a></body></html>`)
  }
  console.log(`built dist/ as of ${asOf}: ${Object.values(data.chains).map((c) => `${c.name} ${c.taskCount} tasks`).join(', ')}; data.json ${(fs.statSync(path.join(dist, 'data.json')).size / 1024).toFixed(0)} KB`)
}

main().catch((e) => { console.error(e); process.exit(1) })
