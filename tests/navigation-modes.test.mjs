import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../site-shell.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../site-shell.css',import.meta.url),'utf8');

function renderForWidth(width,withDesktopNav=true){
 const nodes=[];
 const makeNode=(tag='div')=>{
   const node={
     tag,children:[],attributes:{},dataset:{},hidden:false,className:'',textContent:'',
     append(...children){this.children.push(...children)},
     prepend(...children){this.children.unshift(...children)},
     before(){},focus(){},
     addEventListener(){},
     setAttribute(name,value){this.attributes[name]=String(value)},
     querySelector(){return null},
     classList:{add(){},remove(){}}
   };
   nodes.push(node);
   return node;
 };
 const desktopNav=withDesktopNav?makeNode('nav'):null;
 const actions=makeNode('div');
 const hamburger=makeNode('button');
 const nav=makeNode('div');
 nav.querySelector=selector=>selector==='.nav-links, .navlinks'?desktopNav:
   selector==='.nav-actions'?actions:
   selector==='#mobileToggle, [data-menu]'?hamburger:null;
 const header=makeNode('header');
 header.querySelector=selector=>selector==='.nav'?nav:null;
 const host=makeNode('main');
 const head=makeNode('head');
 const document={
  readyState:'complete',head,documentElement:{dataset:{}},
  createElement:makeNode,
  getElementById:selector=>selector==='publicView'?host:null,
  querySelector:selector=>selector==='#publicView .site-header, .masthead'?header:null,
  querySelectorAll:()=>[],
  addEventListener(){}
 };
 const localStorage={getItem:()=>null,setItem(){}};
 const window={};
 const matchMedia=query=>({matches:query.includes('1101')?width>=1101:width<=600,addEventListener(){}});
 vm.runInNewContext(source,{document,window,localStorage,matchMedia,location:{pathname:'/book.html'}},{timeout:3000});
 const bar=host.children.find(c=>c.className==='hotel-bottom-nav');
 const drawer=host.children.find(c=>c.className==='hotel-mobile-drawer');
 assert.ok(bar,'The actual script must create the phone bottom navigation');
 assert.ok(drawer,'The actual script must create the More/tablet drawer');
 assert.equal(bar.children.length,5,'Phone has 5 bottom tabs');
 assert.equal(bar.children.at(-1).className,'hotel-bottom-link hotel-more');
 assert.equal(bar.children.at(-1).children[1].textContent,'More');
 assert.equal(bar.children.at(-1).children[0].textContent,'⋯','Phone More is not a hamburger');
 assert.ok(head.children.some(c=>c.tag==='link'&&c.href==='/site-shell.css'),'Navigation CSS must load');
 return {bar,drawer,desktopNav};
}

test('shared navigation script renders on a 360px normal Android phone',()=>{
 renderForWidth(360);
});
test('shared navigation script renders on small and large tablet and desktop',()=>{
 for(const width of [390,600,601,768,1024,1100,1101,1440])renderForWidth(width);
});
test('navigation rendering does not depend on desktopNav existing',()=>{
 renderForWidth(360,false);
});
test('CSS maps phone to bottom tabs, tablet to hamburger, desktop to full links',()=>{
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(min-width:601px\) and \(max-width:1100px\)/);
 assert.match(css,/@media\(min-width:1101px\)/);
 assert.match(css,/\.hotel-bottom-nav\{display:grid/);
 assert.match(css,/\.hotel-bottom-nav\{display:none!important\}/);
 assert.match(css,/\.site-header \.mobile-toggle,\.masthead \.menu-button\{display:none!important\}/);
 assert.match(css,/\.site-header \.mobile-toggle,\.masthead \.menu-button\{display:inline-flex!important/);
 assert.match(css,/\.site-header \.nav-links,\.masthead \.navlinks\{display:flex!important\}/);
});
