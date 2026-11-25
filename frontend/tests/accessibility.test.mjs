import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/workspace.css', import.meta.url), 'utf8')
const luminance = hex => {
  const channels = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return channels.reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0)
}
function ratio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a,b) => b-a)
  return (values[0]+.05) / (values[1]+.05)
}
// Verify the actual semantic foreground/background pairs in the new theme.
const pairs = {
  text: ['FFFFFF', 'FAFAF8', 'F5F5F3', 'EDEDEB'],
  muted: ['FFFFFF', 'FAFAF8'],
  'muted-2': ['F5F5F3', 'EDEDEB'],
  cyan: ['FFFFFF', 'E5F3F2'],
  orange: ['FFFFFF', 'FFF0E4'],
  green: ['FFFFFF', 'E5F3E2'],
  red: ['FFFFFF', 'FCEAEA'],
}
for (const [token, backgrounds] of Object.entries(pairs)) {
  test(`${token} text meets 4.5:1 on its intended surfaces`, () => {
    const match = css.match(new RegExp(`--${token}:\\s*#([0-9a-f]{6})`, 'i'))
    assert.ok(match, `Missing color token ${token}`)
    for (const background of backgrounds) {
      assert.ok(ratio(match[1], background) >= 4.5, `${token} / #${background} is ${ratio(match[1], background).toFixed(2)}:1`)
    }
  })
}
test('placeholder color remains legible on white inputs', () => {
  assert.ok(ratio('737373', 'FFFFFF') >= 4.5)
})
