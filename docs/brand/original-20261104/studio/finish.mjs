import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const work = "work/arc-logo-studio";
const kit = path.join(work,"kit");
await fs.mkdir(kit,{recursive:true});
for (const [name,file,width] of [["plate","docs/brand/arc-identity.png",1440],["cover","public/og.png",1672]]) {
  await sharp(path.join(work,name+"-2x.png")).resize({width}).png({compressionLevel:9}).toFile(file);
}
for (const [file,w] of [["arc-logo",1296],["arc-mark",512]]) {
  const original=await fs.readFile("public/brand/"+file+".svg","utf8");
  for(const [name,source] of [[file,original],[file+"-ivory",original.replace('color="#171715"','color="#f3efe6"')]]) {
    await fs.writeFile(path.join(kit,name+".svg"),source);
    await sharp(Buffer.from(source),{density:540}).resize({width:w}).png({compressionLevel:9}).toFile(path.join(kit,name+".png"));
  }
}
await fs.copyFile(path.join(kit,"arc-logo.png"),"docs/brand/arc-logo.png");
for(const [file,name] of [["public/favicon.svg","favicon.svg"],["docs/brand/arc-identity.png","identity-preview.png"],["public/og.png","social-cover.png"]]) await fs.copyFile(file,path.join(kit,name));
await fs.writeFile(path.join(kit,"说明.txt"),"Arc. 品牌标志\n\nA 的左脚向上伸出一条弧线，朱橙色标出学习路径上的「今天」。\n\narc-logo：完整字标。arc-mark：适合头像的独立 A。SVG 均为轮廓，无需字体；PNG 均为透明背景。\n浅底使用炭黑版本；深底使用文件名含 ivory 的纸白版本。\nfavicon.svg：为 16–32 像素调整过的浏览器图标。\nidentity-preview.png：标志预览。social-cover.png：链接分享封面。\n\n炭黑 #171715 · 纸白 #F3EFE6 · 朱橙 #F0643E\n");
