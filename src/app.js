// Front end: reads data.json (built on the server by build.mjs) and draws everything with plain SVG.
const $ = (s) => document.querySelector(s)
const C = { ground: '#12100E', panel: '#221E1A', line: '#453E37', cream: '#EFE9E2', paper: '#FFF6E8', muted: '#B0A79D', magenta: '#E74079', salmon: '#D9A097', maroon: '#3A1420' }
const fmt = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }))
const money = (n) => (n >= 1000 ? `$${fmt(n / 1000, 1)}k` : `$${fmt(n, n < 10 ? 2 : 0)}`)
const pct = (x) => `${fmt(x * 100, 1)}%`
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const svg = (w, h, inner) => `<svg viewBox="0 0 ${w} ${h}" role="img" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago` }

const params = new URLSearchParams(location.search)
let D, chain = params.get('chain') === 'base' ? '8453' : '4217', range = ['7d', '30d', '90d', 'all'].includes(params.get('range')) ? params.get('range') : '30d'

function setUrl() {
  const p = new URLSearchParams(); if (chain === '8453') p.set('chain', 'base'); if (range !== '30d') p.set('range', range)
  history.replaceState(null, '', `${location.pathname}${p.toString() ? '?' + p : ''}${location.hash}`)
}

function tiles() {
  const c = D.chains[chain], s = c.stats
  const items = [
    [fmt(s.openTasks), 'open tasks now'], [fmt(s.activeAgents7d), 'active agents, 7 days'], [fmt(s.activeWorkers7d), 'active workers, 7 days'],
    [fmt(s.registeredWorkers), 'registered workers'], [fmt(s.paidWorkers), `paid workers on ${c.name}`], [fmt(s.activeWallets), `active wallets on ${c.name}`],
    [fmt(c.taskCount), `tasks listed on ${c.name}`], [money(c.postedTotal), `rewards posted on ${c.name} (${c.token})`],
  ]
  $('#tiles').innerHTML = items.map(([n, l]) => `<div class="tile"><span class="num">${n}</span><span class="lab">${l}</span></div>`).join('')
}

// The original view: reward flowing from posters (left) to the workers who won it (right).
function flow() {
  const c = D.chains[chain], f = c.flow
  const W = 960, H = 440, padY = 10, nodeW = 14, gap = 10
  const left = {}, right = {}
  for (const l of f.links) { left[l.s] = (left[l.s] || 0) + l.v; right[l.w] = (right[l.w] || 0) + l.v }
  const order = (m) => Object.entries(m).sort((a, b) => (a[0].startsWith('other') ? 1 : b[0].startsWith('other') ? -1 : b[1] - a[1]))
  const L = order(left), R = order(right), total = f.singleValue || 1
  const scale = (H - 2 * padY - gap * (Math.max(L.length, R.length) - 1)) / total
  const place = (arr) => { let y = padY; const pos = {}; for (const [k, v] of arr) { pos[k] = { y, h: Math.max(2, v * scale), off: 0 }; y += Math.max(2, v * scale) + gap } return pos }
  const pl = place(L), pr = place(R)
  const x0 = 170, x1 = W - 170
  let ribbons = ''
  for (const l of [...f.links].sort((a, b) => b.v - a.v)) {
    const a = pl[l.s], b = pr[l.w], h = Math.max(1, l.v * scale)
    const y0 = a.y + a.off + h / 2, y1 = b.y + b.off + h / 2; a.off += h; b.off += h
    const mx = (x0 + x1) / 2
    const hot = !l.s.startsWith('other') && !l.w.startsWith('other')
    ribbons += `<path d="M${x0 + nodeW},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}" stroke="${hot ? C.salmon : C.line}" stroke-opacity="${hot ? 0.55 : 0.8}" stroke-width="${h}" fill="none"><title>${esc(l.s)} → ${esc(l.w)}: ${money(l.v)}</title></path>`
  }
  const label = (pos, arr, x, anchor) => arr.map(([k, v]) => `<rect x="${x}" y="${pos[k].y}" width="${nodeW}" height="${pos[k].h}" rx="3" fill="${k.startsWith('other') ? C.muted : C.paper}"/>` +
    `<text x="${anchor === 'end' ? x - 8 : x + nodeW + 8}" y="${pos[k].y + pos[k].h / 2 + 4}" text-anchor="${anchor}" fill="${C.cream}" font-size="13" font-family="Departure Mono, monospace">${esc(k)} <tspan fill="${C.muted}">${money(v)}</tspan></text>`).join('')
  $('#flowChart').innerHTML = svg(W, H, ribbons + label(pl, L, x0, 'end') + label(pr, R, x1, 'start') +
    `<text x="${x0}" y="${H}" fill="${C.muted}" font-size="12" text-anchor="end">posters</text><text x="${x1 + nodeW}" y="${H}" fill="${C.muted}" font-size="12">winners</text>`)
  const topLink = f.links.find((l) => !l.s.startsWith('other') && !l.w.startsWith('other'))
  $('#flowLede').innerHTML = `On ${c.name}, <b>${fmt(f.singleTasks)}</b> completed single-winner tasks paid out <b>${money(f.singleValue)}</b> ${c.token} to <b>${fmt(f.distinctWinners)}</b> different winners.` +
    (topLink ? ` The thickest single line runs from <code>${esc(topLink.s)}</code> to <code>${esc(topLink.w)}</code>: ${money(topLink.v)}.` : '')
  $('#flowNote').innerHTML = `Top 6 posters and top 6 winners by value; the rest are grouped. Rule: tasks with status <code>completed</code> and exactly one award, reward credited to <code>primaryAward.workerAddress</code>. ` +
    `${fmt(f.multiTasks)} completed multi-winner tasks (${money(f.multiValue)}) are left out because the API does not list how they were split. Addresses are shown shortened, never named.`
}

function line(rows, key, color) {
  const W = 460, H = 130, p = 6
  if (!rows.length) return svg(W, H, '')
  const max = Math.max(1, ...rows.map((r) => r[key]))
  const x = (i) => p + (i * (W - 2 * p)) / Math.max(1, rows.length - 1), y = (v) => H - p - (v / max) * (H - 2 * p - 14)
  const pts = rows.map((r, i) => `${x(i)},${y(r[key])}`).join(' ')
  return svg(W, H, `<polyline points="${p},${H - p} ${pts} ${W - p},${H - p}" fill="${color}" fill-opacity=".12" stroke="none"/>` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>` +
    `<text x="${p}" y="12" fill="${C.muted}" font-size="11" font-family="Departure Mono">${esc(rows[0].t)}</text><text x="${W - p}" y="12" text-anchor="end" fill="${C.muted}" font-size="11" font-family="Departure Mono">${esc(rows.at(-1).t)}</text>` +
    rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r[key])}" r="7" fill="transparent"><title>${esc(r.t)}: ${fmt(r[key], key === 'posted' || key === 'paid' ? 2 : 0)}</title></circle>`).join(''))
}

function trends() {
  const s = D.platform.series[range], rows = s.rows
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0)
  const defs = [['active', 'Active agents', C.salmon, (r) => fmt(Math.max(...r.map((x) => x.active))) + ' peak'], ['tasks', 'Tasks posted', C.paper, () => fmt(sum('tasks'))],
    ['posted', 'Rewards put up', C.magenta, () => money(sum('posted'))], ['paid', 'Rewards paid', C.cream, () => money(sum('paid'))]]
  $('#series').innerHTML = defs.map(([k, t, col, tot]) => `<div class="series"><div class="t"><span>${t} <span class="muted">per ${s.bucket}</span></span><b>${tot(rows)}</b></div>${line(rows, k, col)}</div>`).join('')
  document.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('on', b.dataset.range === range))
}

const bars = (obj, total) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
  `<div class="bar"><span>${esc(k.replace('_', ' '))}</span><span class="track"><span class="fill" style="width:${(100 * v) / Math.max(...Object.values(obj))}%"></span></span><span class="v">${fmt(v)}</span></div>`).join('')

function modes() {
  const c = D.chains[chain]
  $('#modeBars').innerHTML = bars(c.byMode)
  $('#statusBars').innerHTML = bars(c.byStatus)
  const cols = [['completed', C.salmon], ['expired', C.line], ['cancelled', C.maroon]]
  $('#deadBars').innerHTML = Object.entries(c.dead).sort((a, b) => b[1].total - a[1].total).map(([m, d]) =>
    `<div class="stack"><span>${esc(m)}</span><span class="track">${cols.map(([k, col]) => `<span title="${k}: ${d[k]}" style="width:${(100 * d[k]) / d.total}%;background:${col}"></span>`).join('')}</span><span class="v">${pct((d.expired + d.cancelled) / d.total)}</span></div>`).join('') +
    `<div class="legend">${cols.map(([k, col]) => `<span><i style="background:${col}"></i>${k}</span>`).join('')}<span>right column: share that expired or was cancelled</span></div>`
  const b = D.platform.breakdowns, tot = (xs) => xs.reduce((a, x) => a + x.count, 0)
  $('#modesNote').innerHTML = `Counts for ${c.name} from <code>/api/tasks</code> (${fmt(c.taskCount)} tasks). The platform-wide <code>/api/stats/breakdowns</code> reports ${fmt(tot(b.status))} tasks across both chains; ` +
    `by actor type it lists ${b.actorType.map((a) => `${fmt(a.count)} ${esc(a.actorType)}s`).join(' and ')}. Median submissions on a completed bounty here: <span class="mono">${fmt(c.medianSubmissionsPerWonBounty)}</span>.`
}

function heat() {
  const h = D.platform.heatmap, cw = 34, ch = 30, ox = 40, oy = 22
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const max = Math.max(1, ...h.cells.map((c) => c[2]))
  let g = ''
  for (const [r, col, n] of h.cells) {
    const a = n / max
    g += `<rect x="${ox + col * cw}" y="${oy + r * ch}" width="${cw - 3}" height="${ch - 3}" rx="5" fill="${n === max ? C.magenta : C.salmon}" fill-opacity="${0.08 + 0.92 * a}"><title>${days[r]} ${String(col).padStart(2, '0')}:00 UTC: ${fmt(n)} events</title></rect>`
  }
  for (let r = 0; r < 7; r++) g += `<text x="${ox - 8}" y="${oy + r * ch + 19}" text-anchor="end" fill="${C.muted}" font-size="12">${days[r]}</text>`
  for (let c = 0; c < 24; c += 3) g += `<text x="${ox + c * cw + 2}" y="14" fill="${C.muted}" font-size="11" font-family="Departure Mono">${String(c).padStart(2, '0')}</text>`
  const best = h.cells.reduce((a, c) => (c[2] > a[2] ? c : a), [0, 0, 0])
  $('#heat').innerHTML = svg(ox + 24 * cw, oy + 7 * ch, g) + `<p class="lede">Busiest hour: <b>${days[best[0]]} ${String(best[1]).padStart(2, '0')}:00 UTC</b>, with ${fmt(best[2])} events. The single brightest tile is the only magenta one.</p>`
}

function feed() {
  const label = { task_submitted: 'submitted', task_created: 'posted', task_completed: 'completed', task_awarded: 'awarded', task_claimed: 'claimed' }
  $('#feedList').innerHTML = D.platform.feed.map((i) => `<li><time datetime="${esc(i.ts)}">${ago(i.ts)}</time><span><span class="ty">${esc(label[i.type] || i.type)}</span> · ${esc(i.title)}</span><span class="muted">${i.chain === 8453 ? 'Base' : 'Tempo'}</span></li>`).join('')
}

function posters() {
  const c = D.chains[chain], rows = c.postersPerWeek
  const W = 460, H = 170, p = 8, bw = (W - 2 * p) / Math.max(1, rows.length)
  const max = Math.max(1, ...rows.map((r) => r.posters))
  $('#postersChart').innerHTML = svg(W, H, rows.map((r, i) => { const h = (r.posters / max) * (H - 30); return `<rect x="${p + i * bw + 1}" y="${H - 16 - h}" width="${bw - 3}" height="${h}" rx="3" fill="${C.salmon}"><title>week of ${r.week}: ${r.posters} posters</title></rect><text x="${p + i * bw + bw / 2}" y="${H - 18 - h}" text-anchor="middle" fill="${C.muted}" font-size="10" font-family="Departure Mono">${r.posters}</text>` }).join('') +
    `<text x="${p}" y="${H - 2}" fill="${C.muted}" font-size="10" font-family="Departure Mono">${esc(rows[0]?.week || '')}</text><text x="${W - p}" y="${H - 2}" text-anchor="end" fill="${C.muted}" font-size="10" font-family="Departure Mono">${esc(rows.at(-1)?.week || '')}</text>`)
  $('#concentration').innerHTML = `<p><span class="big">${pct(c.top1Share)}</span><br><span class="muted">of all rewards posted on ${c.name} came from a single address</span></p>` +
    `<p><span class="big">${pct(c.top5Share)}</span><br><span class="muted">came from the top 5 of ${fmt(c.distinctPosters)} distinct posters</span></p>` +
    `<div>${c.topPosters.map((t) => `<div class="bar"><span class="mono">${esc(t.a)}</span><span class="track"><span class="fill" style="width:${(100 * t.v) / c.topPosters[0].v}%"></span></span><span class="v">${money(t.v)}</span></div>`).join('')}</div>`
}

function methods() {
  $('#methodsBody').innerHTML = `<ul>
  <li>Data source: <code>${esc(D.api)}</code>, fetched on the server by a scheduled GitHub Actions build every hour; this page only reads the cached <code>data.json</code>. Data as of <time>${esc(D.asOf)}</time>.</li>
  <li>Endpoints: ${D.endpoints.map((e) => `<code>${esc(e)}</code>`).join(', ')}.</li>
  <li>Per-chain numbers (tiles marked with a chain, flow, modes, posters) are computed from the full paginated <code>/api/tasks</code> list for that <code>chainId</code>. Rewards are 6-decimal stablecoin units divided by 10<sup>6</sup>.</li>
  <li>The <code>/api/stats/*</code> endpoints returned the same body for <code>chainId=4217</code> and <code>8453</code> when checked, so trends, heatmap, feed and the platform breakdown are shown once, labelled platform-wide.</li>
  <li>Distinct posters per week: unique <code>requester</code> addresses among tasks created in that UTC week (Monday start). Concentration: share of the summed task rewards by requester.</li>
  <li>No names are attached to addresses. No wallet connection, no analytics, no cookies.</li></ul>`
}

function render() { tiles(); flow(); trends(); modes(); heat(); feed(); posters(); methods()
  document.querySelectorAll('[data-chain]').forEach((b) => b.classList.toggle('on', b.dataset.chain === chain)) }

fetch('data.json').then((r) => r.json()).then((d) => {
  D = d; $('#asof').textContent = new Date(d.asOf).toUTCString().replace('GMT', 'UTC'); render()
  document.querySelectorAll('[data-chain]').forEach((b) => b.onclick = () => { chain = b.dataset.chain; setUrl(); render() })
  document.querySelectorAll('[data-range]').forEach((b) => b.onclick = () => { range = b.dataset.range; setUrl(); trends() })
  document.querySelectorAll('.share').forEach((a) => a.onclick = async (e) => {
    const url = new URL(a.getAttribute('href'), location.href).href
    if (navigator.share) { e.preventDefault(); try { await navigator.share({ url }) } catch {} }
    else if (navigator.clipboard) { e.preventDefault(); await navigator.clipboard.writeText(url); a.textContent = 'Link copied' }
  })
})
