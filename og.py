# og.py: draws the share cards (1200x630) from dist/data.json with the brand fonts. Run after build.mjs.
# Needs Pillow (pip install pillow). Every number on a card comes from the same data.json the page shows.
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')
A = os.path.join(HERE, 'src', 'assets')
GROUND, MAROON, PANEL, LINE = (18, 16, 14), (58, 20, 32), (34, 30, 26), (69, 62, 55)
CREAM, PAPER, MUTED, MAGENTA, SALMON = (239, 233, 226), (255, 246, 232), (176, 167, 157), (231, 64, 121), (217, 160, 151)
W, H = 1200, 630

def font(name, size, wght=None):
    f = ImageFont.truetype(os.path.join(A if not name.endswith('.otf') else os.path.join(HERE, 'og_fonts'), name), size)
    if wght:
        try: f.set_variation_by_axes([wght])
        except Exception: pass
    return f

SERIF, SERIF_I = 'InstrumentSerif-Regular.ttf', 'InstrumentSerif-Italic.ttf'
INTER, MONO = 'InterTight-Variable.ttf', 'DepartureMono-Regular.otf'

def base():
    im = Image.new('RGB', (W, H), GROUND)
    glow = Image.new('RGB', (W, H), MAROON)
    mask = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mask)
    for i in range(60):  # soft maroon glow from the top-right corner, fading into ground
        r = 900 - i * 14
        md.ellipse([W - r, -r, W + r, r], fill=int(4 + i * 2.2))
    im.paste(glow, (0, 0), mask)
    lock = Image.open(os.path.join(A, 'taskmarket-lockup.png')).convert('RGBA')
    lw = int(W * 0.30); lock = lock.resize((lw, int(lock.height * lw / lock.width)))
    im.paste(lock, (60, H - 60 - lock.height), lock)
    d = ImageDraw.Draw(im)
    d.text((W - 60, 56), 'taskmarket.dev', font=font(MONO, 26), fill=CREAM, anchor='ra')
    return im, d

def headline(d, plain, accent, y=70):
    f, fi = font(SERIF, 84), font(SERIF_I, 84)
    d.text((60, y), plain, font=f, fill=CREAM)
    x = 60 + d.textlength(plain, font=f)
    d.text((x, y), accent, font=fi, fill=MAGENTA)

def stat(d, x, y, num, label):
    d.text((x, y), num, font=font(MONO, 64), fill=PAPER)
    d.text((x, y + 78), label, font=font(INTER, 24, 500), fill=MUTED)

def foot(d, asof):
    d.text((W - 60, H - 74), f'data as of {asof[:16].replace("T", " ")} UTC', font=font(MONO, 20), fill=MUTED, anchor='ra')
    d.text((W - 60, H - 44), 'made for a paid Taskmarket bounty, not official', font=font(INTER, 18, 500), fill=MUTED, anchor='ra')

def money(v):
    return f'${v/1000:.1f}k' if v >= 1000 else f'${v:,.0f}'

def main():
    D = json.load(open(os.path.join(DIST, 'data.json'), encoding='utf-8'))
    T, B = D['chains']['4217'], D['chains']['8453']
    out = os.path.join(DIST, 'og'); os.makedirs(out, exist_ok=True)
    s = T['stats']
    cards = {
        'home': (('The market, ', 'live.'), [(f"{s['openTasks']:,}", 'open tasks now'), (f"{s['activeAgents7d']:,}", 'active agents, 7 days'), (f"{T['taskCount'] + B['taskCount']:,}", 'tasks on Tempo + Base')]),
        'flow': (('Where the money ', 'goes.'), [(money(T['flow']['singleValue']), f"to {T['flow']['distinctWinners']} single winners, Tempo"), (money(B['flow']['singleValue']), f"to {B['flow']['distinctWinners']} single winners, Base")]),
        'trends': (('The market over ', 'time.'), [(f"{max(r['active'] for r in D['platform']['series']['30d']['rows']):,}", 'peak active agents a day, 30d'), (money(sum(r['paid'] for r in D['platform']['series']['30d']['rows'])), 'rewards paid, last 30 days')]),
        'modes': (('How tasks ', 'end.'), [(f"{T['byMode'].get('bounty', 0):,}", 'bounties on Tempo'), (f"{B['medianSubmissionsPerWonBounty']}", 'median entries per won bounty, Base')]),
        'heatmap': (('When it gets ', 'busy.'), [((lambda c: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][c[0]] + f' {c[1]:02d}:00')(max(D['platform']['heatmap']['cells'], key=lambda c: c[2])), 'busiest hour of the week, UTC')]),
        'posters': (('Who posts the ', 'work.'), [(f"{T['top1Share']*100:.0f}%", 'of Tempo rewards from one address'), (f"{B['top5Share']*100:.0f}%", 'of Base rewards from the top 5')]),
    }
    for name, ((plain, accent), stats) in cards.items():
        im, d = base()
        headline(d, plain, accent)
        for i, (n, l) in enumerate(stats):
            stat(d, 60 + i * 380, 230, n, l)
        foot(d, D['asOf'])
        im.save(os.path.join(out, f'{name}.png'), optimize=True)
    print('og cards:', ', '.join(cards))

if __name__ == '__main__':
    main()
