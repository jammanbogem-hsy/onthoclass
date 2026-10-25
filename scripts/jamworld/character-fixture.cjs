const requireFunction = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
const sharp = requireFunction('sharp');
// Deliberately distinct poses/directions used only in tests, never published as user assets.
async function characterFixture(view, repeat = false, inset = false, columns = 5, canonical = false, sameDirections = false) {
  const rows = canonical ? (view === 'td' ? 3 : 5) : (view === 'td' ? 4 : 8), cw = 256, ch = 1024 / rows;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cw}" height="1024">`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const x = inset ? 210 + c * 200 : c * cw + cw / 2, y = inset ? r * ch * .96 + 4 : r * ch, pose = repeat ? 0 : c;
    svg += `<g fill="hsl(${(sameDirections ? 0 : r) * 40},70%,50%)"><rect x="${x - 25}" y="${y + ch * .2}" width="50" height="${ch * .2}" rx="12"/><rect x="${x - 32}" y="${y + ch * .4}" width="64" height="${ch * .25}"/><rect x="${x - 26 - pose * 3}" y="${y + ch * .63}" width="18" height="${ch * (.16 + pose * .01)}"/><rect x="${x + 8 + pose * 3}" y="${y + ch * .63}" width="18" height="${ch * (.2 - pose * .01)}"/></g>`;
  }
  return sharp(Buffer.from(svg + '</svg>')).png().toBuffer();
}
module.exports = { characterFixture };
