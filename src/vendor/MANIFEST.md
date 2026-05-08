# Vendored Library Manifest

| File | Version | Source | SHA-384 (hex) | Retrieved |
|------|---------|--------|---------------|-----------|
| react.production.min.js | 18.3.1 | https://unpkg.com/react@18.3.1/umd/react.production.min.js | 0c6c8bc40ca3ab47fd48fa557af0fa220ced085967305ea85bf5d01a67def88b19f13a84883adc1e430b288e9f881fd9 | 2026-05-07 |
| react-dom.production.min.js | 18.3.1 | https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js | 8131b1873db595519834c71d24ecaad3511d8348e19ff736da7b31d24caa3f44f1695e5655db121f57d20d47f96098f5 | 2026-05-07 |

## Update procedure

1. Re-download from the URL above to a temp file.
2. Compute SHA-384 hex: `node -e "const c=require('crypto'),f=require('fs'); console.log(c.createHash('sha384').update(f.readFileSync(process.argv[1])).digest('hex'))" <file>`
3. Verify the change is intentional (new minor/patch release, not a supply-chain incident).
4. Update the file and this table in the same commit.
5. Run `npm run verify:vendor` to confirm.
