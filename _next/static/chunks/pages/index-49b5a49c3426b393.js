(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[405],{8312:function(e,t,r){(window.__NEXT_P=window.__NEXT_P||[]).push(["/",function(){return r(85)}])},3740:function(e,t,r){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.default=void 0;var a=r(6495).Z,n=r(2648).Z,i=r(1598).Z,s=r(7273).Z,o=i(r(7294)),l=n(r(2636)),c=r(7757),d=r(3735),u=r(3341);r(4210);var m=n(r(7746));let f={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[16,32,48,64,96,128,256,384],path:"/_next/image",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!1};function p(e){return void 0!==e.default}function h(e){return"number"==typeof e||void 0===e?e:"string"==typeof e&&/^[0-9]+$/.test(e)?parseInt(e,10):NaN}function g(e,t,r,n,i,s,o){if(!e||e["data-loaded-src"]===t)return;e["data-loaded-src"]=t;let l="decode"in e?e.decode():Promise.resolve();l.catch(()=>{}).then(()=>{if(e.parentElement&&e.isConnected){if("blur"===r&&s(!0),null==n?void 0:n.current){let t=new Event("load");Object.defineProperty(t,"target",{writable:!1,value:e});let r=!1,i=!1;n.current(a({},t,{nativeEvent:t,currentTarget:e,target:e,isDefaultPrevented:()=>r,isPropagationStopped:()=>i,persist:()=>{},preventDefault:()=>{r=!0,t.preventDefault()},stopPropagation:()=>{i=!0,t.stopPropagation()}}))}(null==i?void 0:i.current)&&i.current(e)}})}function _(e){let[t,r]=o.version.split("."),a=parseInt(t,10),n=parseInt(r,10);return a>18||18===a&&n>=3?{fetchPriority:e}:{fetchpriority:e}}let x=o.forwardRef((e,t)=>{var{imgAttributes:r,heightInt:n,widthInt:i,qualityInt:l,className:c,imgStyle:d,blurStyle:u,isLazy:m,fetchPriority:f,fill:p,placeholder:h,loading:x,srcString:v,config:j,unoptimized:w,loader:b,onLoadRef:y,onLoadingCompleteRef:N,setBlurComplete:E,setShowAltText:S,onLoad:C,onError:z}=e,k=s(e,["imgAttributes","heightInt","widthInt","qualityInt","className","imgStyle","blurStyle","isLazy","fetchPriority","fill","placeholder","loading","srcString","config","unoptimized","loader","onLoadRef","onLoadingCompleteRef","setBlurComplete","setShowAltText","onLoad","onError"]);return x=m?"lazy":x,o.default.createElement(o.default.Fragment,null,o.default.createElement("img",Object.assign({},k,_(f),{loading:x,width:i,height:n,decoding:"async","data-nimg":p?"fill":"1",className:c,style:a({},d,u)},r,{ref:o.useCallback(e=>{t&&("function"==typeof t?t(e):"object"==typeof t&&(t.current=e)),e&&(z&&(e.src=e.src),e.complete&&g(e,v,h,y,N,E,w))},[v,h,y,N,E,z,w,t]),onLoad:e=>{let t=e.currentTarget;g(t,v,h,y,N,E,w)},onError:e=>{S(!0),"blur"===h&&E(!0),z&&z(e)}})))}),v=o.forwardRef((e,t)=>{let r,n;var i,{src:g,sizes:v,unoptimized:j=!1,priority:w=!1,loading:b,className:y,quality:N,width:E,height:S,fill:C,style:z,onLoad:k,onLoadingComplete:I,placeholder:O="empty",blurDataURL:P,fetchPriority:R,layout:L,objectFit:A,objectPosition:M,lazyBoundary:F,lazyRoot:H}=e,D=s(e,["src","sizes","unoptimized","priority","loading","className","quality","width","height","fill","style","onLoad","onLoadingComplete","placeholder","blurDataURL","fetchPriority","layout","objectFit","objectPosition","lazyBoundary","lazyRoot"]);let B=o.useContext(u.ImageConfigContext),G=o.useMemo(()=>{let e=f||B||d.imageConfigDefault,t=[...e.deviceSizes,...e.imageSizes].sort((e,t)=>e-t),r=e.deviceSizes.sort((e,t)=>e-t);return a({},e,{allSizes:t,deviceSizes:r})},[B]),T=D,W=T.loader||m.default;delete T.loader;let V="__next_img_default"in W;if(V){if("custom"===G.loader)throw Error('Image with src "'.concat(g,'" is missing "loader" prop.')+"\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader")}else{let e=W;W=t=>{let{config:r}=t,a=s(t,["config"]);return e(a)}}if(L){"fill"===L&&(C=!0);let e={intrinsic:{maxWidth:"100%",height:"auto"},responsive:{width:"100%",height:"auto"}}[L];e&&(z=a({},z,e));let t={responsive:"100vw",fill:"100vw"}[L];t&&!v&&(v=t)}let q="",U=h(E),Z=h(S);if("object"==typeof(i=g)&&(p(i)||void 0!==i.src)){let e=p(g)?g.default:g;if(!e.src)throw Error("An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ".concat(JSON.stringify(e)));if(!e.height||!e.width)throw Error("An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ".concat(JSON.stringify(e)));if(r=e.blurWidth,n=e.blurHeight,P=P||e.blurDataURL,q=e.src,!C){if(U||Z){if(U&&!Z){let t=U/e.width;Z=Math.round(e.height*t)}else if(!U&&Z){let t=Z/e.height;U=Math.round(e.width*t)}}else U=e.width,Z=e.height}}let J=!w&&("lazy"===b||void 0===b);(!(g="string"==typeof g?g:q)||g.startsWith("data:")||g.startsWith("blob:"))&&(j=!0,J=!1),G.unoptimized&&(j=!0),V&&g.endsWith(".svg")&&!G.dangerouslyAllowSVG&&(j=!0),w&&(R="high");let[Q,X]=o.useState(!1),[Y,$]=o.useState(!1),K=h(N),ee=Object.assign(C?{position:"absolute",height:"100%",width:"100%",left:0,top:0,right:0,bottom:0,objectFit:A,objectPosition:M}:{},Y?{}:{color:"transparent"},z),et="blur"===O&&P&&!Q?{backgroundSize:ee.objectFit||"cover",backgroundPosition:ee.objectPosition||"50% 50%",backgroundRepeat:"no-repeat",backgroundImage:'url("data:image/svg+xml;charset=utf-8,'.concat(c.getImageBlurSvg({widthInt:U,heightInt:Z,blurWidth:r,blurHeight:n,blurDataURL:P,objectFit:ee.objectFit}),'")')}:{},er=function(e){let{config:t,src:r,unoptimized:a,width:n,quality:i,sizes:s,loader:o}=e;if(a)return{src:r,srcSet:void 0,sizes:void 0};let{widths:l,kind:c}=function(e,t,r){let{deviceSizes:a,allSizes:n}=e;if(r){let e=/(^|\s)(1?\d?\d)vw/g,t=[];for(let a;a=e.exec(r);a)t.push(parseInt(a[2]));if(t.length){let e=.01*Math.min(...t);return{widths:n.filter(t=>t>=a[0]*e),kind:"w"}}return{widths:n,kind:"w"}}if("number"!=typeof t)return{widths:a,kind:"w"};let i=[...new Set([t,2*t].map(e=>n.find(t=>t>=e)||n[n.length-1]))];return{widths:i,kind:"x"}}(t,n,s),d=l.length-1;return{sizes:s||"w"!==c?s:"100vw",srcSet:l.map((e,a)=>"".concat(o({config:t,src:r,quality:i,width:e})," ").concat("w"===c?e:a+1).concat(c)).join(", "),src:o({config:t,src:r,quality:i,width:l[d]})}}({config:G,src:g,unoptimized:j,width:U,quality:K,sizes:v,loader:W}),ea=g,en=o.useRef(k);o.useEffect(()=>{en.current=k},[k]);let ei=o.useRef(I);o.useEffect(()=>{ei.current=I},[I]);let es=a({isLazy:J,imgAttributes:er,heightInt:Z,widthInt:U,qualityInt:K,className:y,imgStyle:ee,blurStyle:et,loading:b,config:G,fetchPriority:R,fill:C,unoptimized:j,placeholder:O,loader:W,srcString:ea,onLoadRef:en,onLoadingCompleteRef:ei,setBlurComplete:X,setShowAltText:$},T);return o.default.createElement(o.default.Fragment,null,o.default.createElement(x,Object.assign({},es,{ref:t})),w?o.default.createElement(l.default,null,o.default.createElement("link",Object.assign({key:"__nimg-"+er.src+er.srcSet+er.sizes,rel:"preload",as:"image",href:er.srcSet?void 0:er.src,imageSrcSet:er.srcSet,imageSizes:er.sizes,crossOrigin:T.crossOrigin},_(R)))):null)});t.default=v,("function"==typeof t.default||"object"==typeof t.default&&null!==t.default)&&void 0===t.default.__esModule&&(Object.defineProperty(t.default,"__esModule",{value:!0}),Object.assign(t.default,t),e.exports=t.default)},7757:function(e,t){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.getImageBlurSvg=function(e){let{widthInt:t,heightInt:r,blurWidth:a,blurHeight:n,blurDataURL:i,objectFit:s}=e,o=a||t,l=n||r,c=i.startsWith("data:image/jpeg")?"%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1'/%3E%3C/feComponentTransfer%3E%":"";return o&&l?"%3Csvg xmlns='http%3A//www.w3.org/2000/svg' viewBox='0 0 ".concat(o," ").concat(l,"'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='").concat(a&&n?"1":"20","'/%3E").concat(c,"%3C/filter%3E%3Cimage preserveAspectRatio='none' filter='url(%23b)' x='0' y='0' height='100%25' width='100%25' href='").concat(i,"'/%3E%3C/svg%3E"):"%3Csvg xmlns='http%3A//www.w3.org/2000/svg'%3E%3Cimage style='filter:blur(20px)' preserveAspectRatio='".concat("contain"===s?"xMidYMid":"cover"===s?"xMidYMid slice":"none","' x='0' y='0' height='100%25' width='100%25' href='").concat(i,"'/%3E%3C/svg%3E")}},7746:function(e,t){"use strict";function r(e){let{config:t,src:r,width:a,quality:n}=e;return"".concat(t.path,"?url=").concat(encodeURIComponent(r),"&w=").concat(a,"&q=").concat(n||75)}Object.defineProperty(t,"__esModule",{value:!0}),t.default=void 0,r.__next_img_default=!0,t.default=r},85:function(e,t,r){"use strict";r.r(t),r.d(t,{default:function(){return m}});var a=r(5893),n=r(8993),i=r.n(n),s=r(9008),o=r.n(s),l=r(5675),c=r.n(l),d=r(9854),u=r.n(d);function m(){return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)(o(),{children:[(0,a.jsx)("title",{children:"Create Next App"}),(0,a.jsx)("meta",{name:"description",content:"Generated by create next app"}),(0,a.jsx)("meta",{name:"viewport",content:"width=device-width, initial-scale=1"}),(0,a.jsx)("link",{rel:"icon",href:"/favicon.ico"})]}),(0,a.jsxs)("main",{className:u().main,children:[(0,a.jsxs)("div",{className:u().description,children:[(0,a.jsxs)("p",{children:["Get started by editing\xa0",(0,a.jsx)("code",{className:u().code,children:"src/pages/index.tsx"})]}),(0,a.jsx)("div",{children:(0,a.jsxs)("a",{href:"https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app",target:"_blank",rel:"noopener noreferrer",children:["By"," ",(0,a.jsx)(c(),{src:"/vercel.svg",alt:"Vercel Logo",className:u().vercelLogo,width:100,height:24,priority:!0})]})})]}),(0,a.jsx)("div",{className:u().center,children:(0,a.jsx)(c(),{className:u().logo,src:"/next.svg",alt:"Next.js Logo",width:180,height:37,priority:!0})}),(0,a.jsxs)("div",{className:u().grid,children:[(0,a.jsxs)("a",{href:"https://nextjs.org/docs?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app",className:u().card,target:"_blank",rel:"noopener noreferrer",children:[(0,a.jsxs)("h2",{className:i().className,children:["Docs ",(0,a.jsx)("span",{children:"->"})]}),(0,a.jsx)("p",{className:i().className,children:"Find in-depth information about Next.js features and\xa0API."})]}),(0,a.jsxs)("a",{href:"https://nextjs.org/learn?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app",className:u().card,target:"_blank",rel:"noopener noreferrer",children:[(0,a.jsxs)("h2",{className:i().className,children:["Learn ",(0,a.jsx)("span",{children:"->"})]}),(0,a.jsx)("p",{className:i().className,children:"Learn about Next.js in an interactive course with\xa0quizzes!"})]}),(0,a.jsxs)("a",{href:"https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app",className:u().card,target:"_blank",rel:"noopener noreferrer",children:[(0,a.jsxs)("h2",{className:i().className,children:["Templates ",(0,a.jsx)("span",{children:"->"})]}),(0,a.jsx)("p",{className:i().className,children:"Discover and deploy boilerplate example Next.js\xa0projects."})]}),(0,a.jsxs)("a",{href:"https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app",className:u().card,target:"_blank",rel:"noopener noreferrer",children:[(0,a.jsxs)("h2",{className:i().className,children:["Deploy ",(0,a.jsx)("span",{children:"->"})]}),(0,a.jsx)("p",{className:i().className,children:"Instantly deploy your Next.js site to a shareable URL with\xa0Vercel."})]})]})]})]})}},8993:function(e){e.exports={style:{fontFamily:"'__Inter_e7970e', '__Inter_Fallback_e7970e'",fontStyle:"normal"},className:"__className_e7970e"}},9854:function(e){e.exports={main:"Home_main__EtNt2",description:"Home_description__Qwq1f",code:"Home_code__aGV0U",grid:"Home_grid__c_g6N",card:"Home_card__7oz7W",center:"Home_center__V0nxp",logo:"Home_logo__80mSr",content:"Home_content___fOQz",vercelLogo:"Home_vercelLogo__lhIxO",rotate:"Home_rotate__99GkW"}},9008:function(e,t,r){e.exports=r(2636)},5675:function(e,t,r){e.exports=r(3740)}},function(e){e.O(0,[774,888,179],function(){return e(e.s=8312)}),_N_E=e.O()}]);