/**
 * Render a `.vbp.md` export to PNG for eyeballing (feat-122).
 *
 *   npx tsx scripts/render-profile.ts <file.vbp.md> [more files...] [--out <dir>]
 *       [--instrument NQ|ES] [--price <current>] [--theme light|dark]
 *       [--envelope] [--tiles 2] [--anchor left|right]
 *
 * Writes `<basename>[.t<i>].<theme>[.env][.left].png` (+ `.svg`) into `--out`
 * (default: <tmpdir>/gekko-profile-render) and prints one summary line per
 * image. Instrument defaults from the POC's price magnitude.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parseVbpProfile } from '../lib/engine/parseProfile'
import {
  inferInstrumentFromPrice,
  pngDimensions,
  rasterizePng,
  renderProfile,
  type BarAnchor,
  type Instrument,
  type RenderTheme,
} from '../lib/job-plan/profile-vision'

type Args = {
  files: string[]
  out: string
  instrument?: Instrument
  price?: number
  theme: RenderTheme
  envelope: boolean
  tiles: 1 | 2
  anchor: BarAnchor
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    files: [],
    out: join(tmpdir(), 'gekko-profile-render'),
    theme: 'light',
    envelope: false,
    tiles: 1,
    anchor: 'right',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--out') args.out = next()
    else if (a === '--instrument') args.instrument = next() as Instrument
    else if (a === '--price') args.price = Number(next())
    else if (a === '--theme') args.theme = next() as RenderTheme
    else if (a === '--envelope') args.envelope = true
    else if (a === '--tiles') args.tiles = Number(next()) === 2 ? 2 : 1
    else if (a === '--anchor') args.anchor = next() as BarAnchor
    else args.files.push(a)
  }
  if (args.files.length === 0) throw new Error('usage: render-profile.ts <file.vbp.md> [...]')
  return args
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  mkdirSync(args.out, { recursive: true })
  for (const file of args.files) {
    const profile = parseVbpProfile(readFileSync(file, 'utf8'))
    const instrument = args.instrument ?? inferInstrumentFromPrice(profile.meta.pocPrice)
    const result = renderProfile(profile, {
      instrument,
      currentPrice: args.price,
      theme: args.theme,
      envelope: args.envelope,
      tiles: args.tiles,
      barAnchor: args.anchor,
    })
    const stem = basename(file).replace(/\.vbp\.md$/, '')
    const variant = [args.theme, args.envelope ? 'env' : '', args.anchor === 'left' ? 'left' : '']
      .filter(Boolean)
      .join('.')
    for (const tile of result.tiles) {
      const tileTag = tile.tile.of > 1 ? `.t${tile.tile.index}` : ''
      const base = join(args.out, `${stem}${tileTag}.${variant}`)
      const png = rasterizePng(tile.svg)
      writeFileSync(`${base}.svg`, tile.svg)
      writeFileSync(`${base}.png`, png)
      const dim = pngDimensions(png)
      process.stdout.write(
        `${base}.png  ${dim.width}x${dim.height}  ${instrument}  rows ${result.meta.rows}` +
          ` (x${result.meta.binsPerRow} bins, step ${result.meta.step})  span ${tile.tile.priceLow}-${tile.tile.priceHigh}` +
          `  sha256 ${tile.sha256.slice(0, 12)}\n`
      )
    }
  }
}

main()
