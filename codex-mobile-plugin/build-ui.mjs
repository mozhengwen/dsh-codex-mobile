import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const result = await build({ entryPoints: [fileURLToPath(new URL('./ui/panel.js', import.meta.url))], bundle: true, write: false, minify: true, format: 'iife', target: 'es2022', legalComments: 'inline' })
const template = readFileSync(new URL('./ui/panel.template.html', import.meta.url), 'utf8')
writeFileSync(new URL('./ui/panel.html', import.meta.url), template.replace('/* PANEL_SCRIPT */', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script')))
console.log('Built self-contained phone control panel')
