import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ink = '#171715', red = '#f0643e', paper='#f3efe6';
const r = '<path d="M96 83V80C100 80 102 78 102 74V45L96 42V40L113 35H115V47C119 39 125 34 132 34C137 34 140 37 140 41C140 45 137 48 133 48C129 48 127 46 125 43C120 44 117 48 115 54V74C115 78 117 80 124 80V83Z"/>';
const c = '<path d="M189 70C183 79 176 84 165 84C150 84 141 74 141 60C141 45 152 34 168 34C180 34 187 40 187 46C187 50 184 53 180 53C175 53 173 50 173 46C173 43 174 41 173 39C172 37 170 37 168 37C159 37 154 47 154 57C154 69 160 77 171 77C177 77 183 74 187 69Z"/>';
const name = r + c + '<circle cx="201" cy="76" r="7"/>';
const marks=[
  ['Arch / point', '<path d="M1 83C9 47 32 15 57 3H60L94 83H74L51 27C32 39 16 61 9 83Z"/><circle fill="'+red+'" cx="45" cy="62" r="7.4"/>'],
  ['Sweep / point', '<path d="M1 83C9 47 32 15 57 3H60L94 83H74L51 27C32 39 16 61 9 83Z"/><path d="M8 82C17 67 29 56 42 53L45 58C30 61 18 72 10 83Z"/><circle fill="'+red+'" cx="52" cy="52" r="5.6"/>'],
  ['Counter / point', '<path d="M1 83 43 4H54L92 83H71L44 23 28 55C36 50 44 47 53 46L56 53C43 52 31 57 23 64L13 83Z"/><circle fill="'+red+'" cx="47" cy="67" r="6.9"/>'],
  ['Clipped apex', '<path d="M0 83C10 60 21 42 37 28L43 35C29 47 17 66 10 83ZM45 23 60 12 93 83H72Z"/><circle fill="'+red+'" cx="53" cy="5" r="6"/>'],
  ['Arch / waypoint', '<path d="M0 83C10 58 25 33 52 12L57 8 62 18C37 34 19 58 8 83ZM58 8H62L94 83H74L52 27Z"/><path d="M25 72C35 70 47 66 56 61L60 65C50 71 37 76 23 77Z"/><circle fill="'+red+'" cx="63" cy="57" r="5.2"/>'],
  ['Fulcrum', '<path d="M0 83C11 43 34 14 60 4L93 83H72L50 26C32 39 16 62 8 83Z"/><path d="M18 73C25 64 35 60 45 60V65C33 65 24 71 18 77Z"/><circle fill="'+red+'" cx="56" cy="62.5" r="6.4"/>']
];
const cells=marks.map(([label,mark],i)=>{const x=(i%2)*630,y=Math.floor(i/2)*215;return '<g transform="translate('+x+' '+y+')"><text x="22" y="30" font-size="13" font-family="Arial">'+label+'</text><g transform="translate(34 72) scale(1.3)">'+mark+name+'</g><g transform="translate(383 86) scale(.78)">'+mark+'</g><rect x="522" y="86" width="48" height="48" fill="'+ink+'"/><g transform="translate(527 91) scale(.40)" fill="'+paper+'">'+mark+'</g></g>'}).join('');
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1260 645" width="1260" height="645"><rect width="1260" height="645" fill="'+paper+'"/><g fill="'+ink+'">'+cells+'</g></svg>';
writeFileSync(new URL('study.svg',import.meta.url), svg);
await sharp(Buffer.from(svg)).png().toFile(new URL('study.png',import.meta.url).pathname.replace(/^\/(.:\/)/,'$1'));
