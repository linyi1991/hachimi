import fs from 'node:fs/promises';
const data=JSON.parse(await fs.readFile('data.json','utf8'));
const planner=(await fs.readFile('plan.mjs','utf8')).replace('export function','function');
const html=(await fs.readFile('index.html','utf8')).replace('/* DATA_PLACEHOLDER */',`const DATA=${JSON.stringify(data)};\n${planner}`).replace('/* EXTRA_CLIENT */',await fs.readFile('features.js','utf8')).replace('</style>',(await fs.readFile('extra.css','utf8'))+'</style>');
const server=await fs.readFile('server.mjs','utf8');
await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});
const xlsx=await fs.readFile('assets/materials.xlsx');
await fs.writeFile('dist/server/index.js',`const DATA=${JSON.stringify(data)};\nconst HTML=${JSON.stringify(html)};\nconst XLSX=${JSON.stringify(xlsx.toString('base64'))};\n${server}`);
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
const backend='https://hachimi.quirky-clove-0350.chatgpt.site';
const pagesHtml=html.replace("const BASE_PATH='';const API_ORIGIN='';",`const BASE_PATH='/hachimi';const API_ORIGIN='${backend}';`).replaceAll('href="/','href="/hachimi/');
await fs.mkdir('pages',{recursive:true});
for(const route of ['','guide','parts','voyages','sources','lookup','planner']){await fs.mkdir('pages/'+route,{recursive:true});await fs.writeFile('pages/'+route+'/index.html',pagesHtml);}
await fs.writeFile('pages/download.xlsx',xlsx);await fs.writeFile('pages/.nojekyll','');
console.log('Built Hachimi with '+data.items.length+' verified materials.');
