import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';

const read = (path) => fs.readFile(path, 'utf8');
const output = (path, data) => fs.writeFile(path, data);
const parse = (svg) => new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
const xmlns = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (w,h,body) => '<svg '+xmlns+' width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+body+'</svg>';
const ink='#171715', ivory='#f3efe6', accent='#f0643e', muted='#615c54';
const logo = await read('public/brand/arc-logo.svg');
const master = parse(logo);
const mark = master.querySelector('#arc-mark').innerHTML.trim();
const word = master.querySelector('#arc-wordmark').innerHTML.trim();
const micro = parse(await read('public/favicon.svg')).documentElement.innerHTML.trim();
const dir='docs/brand';
await fs.mkdir(dir,{recursive:true});
const rect=(x,y,w,h,fill,rx=0)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+fill+'"/>';
const line=(x1,y1,x2,y2,stroke,width=1)=>'<path d="M'+x1+' '+y1+'L'+x2+' '+y2+'" stroke="'+stroke+'" stroke-width="'+width+'"/>';
const group=(x,y,s,fill,body)=>'<g transform="translate('+x+' '+y+') scale('+s+')" fill="'+fill+'">'+body+'</g>';
const txt=(x,y,content,extra='')=>'<text x="'+x+'" y="'+y+'" '+extra+'>'+content+'</text>';
const mono='ArcMono, Consolas, monospace', display='ArcDisplay, Georgia, serif', sans='ArcSans, Arial, sans-serif';
const textStyle=(font,size,fill,spacing=0)=>'font-family="'+font+'" font-size="'+size+'" fill="'+fill+'" letter-spacing="'+spacing+'"';
const caption=(x,y,content,fill=muted,extra='')=>txt(x,y,content,textStyle(mono,15,fill,1.45)+' '+extra);
const brandFonts = '<style>@font-face{font-family:ArcDisplay;src:url(data:font/woff2;base64,' +
 (await fs.readFile('node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2')).toString('base64') +
 ') format("woff2");font-weight:200 800}@font-face{font-family:ArcSans;src:url(data:font/woff2;base64,' +
 (await fs.readFile('node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2')).toString('base64')+
 ') format("woff2");font-weight:200 800}</style>';
const raster=async (source,target,width)=>{let pipe=sharp(Buffer.from(source),{density:width?Math.ceil(width/216*72):72});if(width)pipe=pipe.resize({width});await pipe.png({compressionLevel:9}).toFile(resolve(target))};

const standalone='<svg '+xmlns+' width="100" height="100" viewBox="-2.5 -7 100 100" color="'+ink+'" role="img" aria-label="Arc. monogram">\n  <g fill="currentColor">\n'+mark+'\n  </g>\n</svg>\n';
await output('public/brand/arc-mark.svg',standalone);
await raster(logo,dir+'/arc-logo.png',1296);

const plate = svg(1440,720,brandFonts+
 rect(0,0,1440,720,ivory)+rect(888,0,552,720,ink)+
 caption(64,62,'PRECISION LEARNING')+caption(824,62,'01   /   WORDMARK',muted,'text-anchor="end"')+
 line(64,88.5,824,88.5,'#c1baad')+
 group(85,172,3.38,ink,word)+
 txt(91,527,'Learn only what moves you forward.',textStyle(display,39,ink,-1.5))+
 line(64,613.5,824,613.5,'#c1baad')+
 caption(64,669,'METHOD')+
 txt(824,669,'Understand   /   Build   /   Prove',textStyle(sans,18,ink,0.1)+' xml:space="preserve" text-anchor="end"')+
 caption(944,62,'02   /   MONOGRAM','#c5c1b6')+
 line(944,88.5,1384,88.5,'#514f49')+
 group(1030.5,197,2.82,ivory,mark)+
 line(944,613.5,1384,613.5,'#514f49')+
 caption(944,669,'TAB ICON','#c5c1b6')+
 group(1086,652,0.5,ink,micro)+txt(1112,666,'16',textStyle(mono,14,'#bcb8af'))+
 group(1182,648,.75,ink,micro)+txt(1216,666,'24',textStyle(mono,14,'#bcb8af'))+
 group(1286,644,1,ink,micro)+txt(1328,666,'32 px',textStyle(mono,14,'#bcb8af')));
await output('work/arc-logo-studio/plate.svg',plate);
await raster(plate,dir+'/arc-identity.png');

const cover=svg(1672,941,brandFonts+
 rect(0,0,1672,941,ivory)+
 caption(105,79,'CAREER INTELLIGENCE',muted)+
 caption(1567,79,'UNDERSTAND   /   BUILD   /   PROVE',muted,'text-anchor="end"')+
 line(105,105,1567,105,'#c9c3b7')+
 group(102,230,3.4,ink,word)+
 txt(108,632,'Learn only what',textStyle(display,72,ink,-2.4))+
 txt(108,705,'moves you forward.',textStyle(display,72,ink,-2.4))+
 caption(108,858,'A PRECISION LEARNING SYSTEM')+
 '<g fill="none"><path d="M670 980C874 906 1007 767 1136 545C1203 430 1253 361 1328 299" stroke="'+ink+'" stroke-width="3.5"/><path d="M1328 299C1419 223 1531 179 1707 139" stroke="#a9a395" stroke-width="2.2"/></g>'+
 '<circle cx="1328" cy="299" r="16.5" fill="'+ivory+'"/><circle cx="1328" cy="299" r="11.5" fill="'+accent+'"/>'+
 line(1354,299,1384,299,'#a9a395')+caption(1398,304,'TODAY'));
await output('work/arc-logo-studio/cover.svg',cover);
await raster(cover,'public/og.png');
