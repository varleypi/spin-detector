/**
 * X credential / permission diagnostic. Publishes nothing.
 *
 * Exists because a bare "Request failed with code 403" from the X API is
 * ambiguous between causes that need completely different fixes, and the only
 * place the credentials exist is GitHub Actions — so there's no way to poke at
 * them from a laptop.
 *
 * The probe: attempt POST /2/tweets with a deliberately INVALID body (empty
 * text). X checks authorization before it validates the payload, so:
 *
 *   • 403 → the app/token genuinely cannot write. Read the detail for which.
 *   • 400 → authorization passed and only the payload was rejected, i.e. write
 *           access is fine and the 403s are about the request, not the creds.
 *
 * Either way nothing is published, which is the point.
 *
 * Run: gh workflow run "X Auth Check"
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local') })

const { getClient, describeXError, X_ENV } = require('./post')

function dump(label, err) {
  console.log(`\n${label}`)
  console.log(`  parsed : ${describeXError(err)}`)
  console.log(`  code   : ${err?.code ?? '(none)'}`)
  if (err?.data) console.log(`  body   : ${JSON.stringify(err.data).slice(0, 600)}`)
  if (err?.rateLimit) console.log(`  rate   : ${JSON.stringify(err.rateLimit)}`)
}

async function main() {
  const missing = X_ENV.filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`❌ Missing credentials: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log('✓ All four X credentials are present')
  for (const k of X_ENV) {
    console.log(`   ${k.padEnd(16)} ${process.env[k].length} chars`)
  }

  const client = getClient()

  // ── 1. Who are we? ────────────────────────────────────────────────────────
  try {
    const me = await client.v2.me()
    console.log(`\n✓ Authenticated as @${me.data.username} (id ${me.data.id}, "${me.data.name}")`)
  } catch (err) {
    dump('✗ v2.me() failed — tokens may be invalid entirely:', err)
  }

  // ── 2. Can we write? ──────────────────────────────────────────────────────
  console.log('\n── Write-permission probe (invalid payload, publishes nothing) ──')
  try {
    await client.v2.tweet('')
    console.log('  ?? Empty tweet was ACCEPTED — unexpected; investigate manually.')
  } catch (err) {
    const code = Number(err?.code)
    dump(`  probe returned ${code}`, err)
    if (code === 403) {
      console.log(`
  ⇒ WRITE IS BLOCKED. Almost always one of:
     1. App permission is Read-only.
        Developer Portal → your app → Settings → User authentication settings
        → set to "Read and write".
     2. Permission was already changed, but the ACCESS TOKEN AND SECRET were
        generated BEFORE that change. Tokens carry the scope they were minted
        with — changing app permissions does NOT upgrade existing tokens.
        Fix: Keys and tokens → Access Token and Secret → Regenerate, then
        update the X_ACCESS_TOKEN / X_ACCESS_SECRET repo secrets.
     3. The app is not attached to a Project (v2 write requires one).`)
    } else if (code === 400) {
      console.log(`
  ⇒ WRITE IS ALLOWED. Authorization passed; only the empty payload was
     rejected. The 403s on real replies are therefore about the REQUEST, not
     the credentials — most likely duplicate-content rejection, or a tier
     restriction on replying to accounts you don't follow.`)
    } else if (code === 429) {
      console.log('\n  ⇒ Rate limited. The monthly post cap may be exhausted.')
    }
  }
}

main().catch((err) => {
  console.error(`Diagnostic failed: ${err.message}`)
  process.exit(1)
})
