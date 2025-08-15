// assets/seo-optimizer.js
(function(){
  const SITE = "Flowzex";
  const DOMAIN = "blog.flowzex.com";
  const LOGO = "https://blog.flowzex.com/assets/logo.png";

  const path = location.pathname.replace(/\/+$/,"/");
  const parts = path.split("/").filter(Boolean);
  const isHome = parts.length===0;
  const isCategory = parts.length===1;
  const isArticle = parts.length>=2;

  function getOrCreateMeta(sel, attrs){
    let el = document.head.querySelector(sel);
    if(!el){ el = document.createElement("meta"); for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); document.head.appendChild(el); }
    return el;
  }
  function clampDesc(s){
    if(!s) return "";
    let d = s.replace(/\s+/g," ").trim();
    if(d.length<50) d += " Get started today!";
    if(d.length>160) d = d.slice(0,157).replace(/[ ,;:.!-]+$/,"")+"...";
    return d;
  }

  // 1) Title (only if missing/too short/too long/no brand)
  (function(){
    const h1 = document.querySelector("h1");
    let t = document.querySelector("title");
    if(!t){ t = document.createElement("title"); document.head.appendChild(t); }
    const cur = t.textContent.trim();
    const ok = cur && cur.length>=30 && cur.length<=65 && /\bFlowzex\b/i.test(cur);
    if(!ok){
      let nt = (h1?.textContent||"AI Sales Guides")+" | "+SITE;
      if(nt.length>65) nt = nt.slice(0,65).replace(/[ ,;:.!-]+$/,"");
      t.textContent = nt;
    }
  })();

  // 2) Description (only if missing or out of range)
  (function(){
    const cur = document.head.querySelector('meta[name="description"]')?.getAttribute("content")||"";
    if(cur.length<50 || cur.length>170){
      const p = document.querySelector("article p, main p, .content p, p");
      const d = clampDesc(p ? p.textContent : "Discover AI cold-calling playbooks, comparisons, and case studies by Flowzex.");
      getOrCreateMeta('meta[name="description"]',{name:"description",content:d}).setAttribute("content",d);
    }
  })();

  // 3) Canonical (add if missing)
  (function(){
    let link = document.head.querySelector('link[rel="canonical"]');
    if(!link){
      link = document.createElement("link"); link.rel="canonical";
      link.href = location.href.split("#")[0].split("?")[0];
      document.head.appendChild(link);
    }
  })();

  // 4) Single H1
  (function(){
    const h1s = Array.from(document.querySelectorAll("h1"));
    if(h1s.length===0){
      const h1=document.createElement("h1");
      h1.textContent=(document.title||"").split("|")[0].trim()||"Welcome to Flowzex";
      (document.querySelector("main")||document.body).prepend(h1);
    } else if(h1s.length>1){
      h1s.slice(1).forEach(n=>{ const h2=document.createElement("h2"); h2.innerHTML=n.innerHTML; h2.className=n.className; n.replaceWith(h2); });
    }
  })();

  // 5) Ensure ≥2 H2 on articles
  (function(){
    if(!isArticle) return;
    const h2s = document.querySelectorAll("h2");
    if(h2s.length===0){
      const t=document.querySelector("article, main, .content")||document.body;
      const a=document.createElement("h2"); a.textContent="Overview";
      const b=document.createElement("h2"); b.textContent="Key Takeaways";
      t.prepend(b); t.prepend(a);
    } else if(h2s.length===1){
      const c=document.createElement("h2"); c.textContent="Next Steps";
      (document.querySelector("article, main, .content")||document.body).appendChild(c);
    }
  })();

  // 6) OG/Twitter/robots (add if missing)
  (function(){
    const desc = document.head.querySelector('meta[name="description"]')?.content||"";
    const type = isArticle? "article" : "website";
    if(document.head.querySelectorAll('meta[property^="og:"]').length<3){
      getOrCreateMeta('meta[property="og:title"]',{property:"og:title",content:document.title});
      getOrCreateMeta('meta[property="og:description"]',{property:"og:description",content:desc});
      getOrCreateMeta('meta[property="og:type"]',{property:"og:type",content:type});
      getOrCreateMeta('meta[property="og:url"]',{property:"og:url",content:location.href});
      getOrCreateMeta('meta[property="og:site_name"]',{property:"og:site_name",content:SITE});
    }
    if(!document.head.querySelector('meta[name="twitter:card"]')){
      getOrCreateMeta('meta[name="twitter:card"]',{name:"twitter:card",content:"summary_large_image"});
      getOrCreateMeta('meta[name="twitter:title"]',{name:"twitter:title",content:document.title});
      getOrCreateMeta('meta[name="twitter:description"]',{name:"twitter:description",content:desc});
    }
    if(!document.head.querySelector('meta[name="robots"]')){
      getOrCreateMeta('meta[name="robots"]',{name:"robots",content:"index, follow"});
    }
  })();

  // 7) Image ALT fallback
  (function(){
    const t=(document.title||"").split("|")[0].trim()||"Flowzex";
    document.querySelectorAll("img").forEach(img=>{ if(!img.getAttribute("alt")) img.setAttribute("alt",t); });
  })();

  // 8) JSON-LD only if missing (keeps builder JSON-LD intact)
  (function(){
    const hasLD = document.head.querySelector('script[type="application/ld+json"]');
    if(hasLD) return;
    let schema;
    if(isHome){
      schema={"@context":"https://schema.org","@type":"Organization","name":SITE,"url":"https://"+DOMAIN,"logo":LOGO};
    } else if(isCategory){
      const name=document.querySelector("h1")?.textContent||"Category";
      schema={"@context":"https://schema.org","@type":"CollectionPage","name":name,"mainEntityOfPage":location.href};
    } else {
      const h1=document.querySelector("h1")?.textContent||document.title;
      const p=document.querySelector("article p, main p, .content p, p");
      const d= (p? p.textContent : "");
      schema={"@context":"https://schema.org","@type":"Article","headline":h1,"description":d,
              "author":{"@type":"Organization","name":SITE,"url":"https://"+DOMAIN},
              "publisher":{"@type":"Organization","name":SITE,"logo":{"@type":"ImageObject","url":LOGO}},
              "datePublished": new Date().toISOString(),"mainEntityOfPage":location.href};
    }
    const s=document.createElement("script"); s.type="application/ld+json"; s.textContent=JSON.stringify(schema);
    document.head.appendChild(s);
  })();
})();
