import { CANONICAL_ORIGIN, ROYAL_WAIVER_TEXT, WAIVER_TEXT } from "./catalog.ts";

function page(title: string, body: string, index: boolean, path = "/"): string {
  const canonical = `${CANONICAL_ORIGIN}${path}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="canonical" href="${canonical}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Sans:wght@400;500;700;800&display=swap"><meta property="og:title" content="What’s Your Bride Price?"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${CANONICAL_ORIGIN}/og-v2.png"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="${index ? "index,follow" : "noindex,nofollow"}"><style>
  :root{color-scheme:dark;--ink:#fff6d8;--bg:#211744;--card:#2c2150;--line:#ffffff2e;--gold:#ffd079}
  body{margin:0;font:16px/1.5 "DM Sans",Arial,sans-serif;background:radial-gradient(ellipse at 100% 0%,#60429c66,transparent 42%),var(--bg);color:var(--ink)}
  h1,h2{font-family:"Bricolage Grotesque","Arial Black",sans-serif;letter-spacing:-.03em}
  main{max-width:42rem;margin:auto;padding:1.5rem}
  a{color:var(--gold)} button,select,input{font:inherit} button{background:linear-gradient(#ffe49a,#ffc54d 48%,#f0a11a);color:#2b1a10;border:1px solid #ffe6a6;border-radius:16px;padding:.7rem 1rem;cursor:pointer;font-weight:800}
  .card{background:var(--card);border:1px solid var(--line);border-radius:1rem;padding:1rem;margin:1rem 0}
  .warn{border-color:var(--gold)} .options{display:grid;gap:.5rem} .options button{background:#ffffff10;color:var(--ink);border:1px solid var(--line);border-radius:.8rem;text-align:left}
  label{display:block;margin:.6rem 0} footer nav{display:flex;flex-wrap:wrap;gap:.8rem}
  @media (prefers-reduced-motion:no-preference){button{transition:transform .13s ease}button:active{transform:translateY(4px)}}
  </style></head><body><main>${body}<footer class="card"><p>A playful culture score, never a measure of human worth.</p><nav aria-label="Legal"><a href="/">Game</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refunds">Refunds</a></nav></footer></main></body></html>`;
}

export function legalPage(kind: "privacy" | "terms" | "refunds", royalRevealEnabled = false): string {
  const shared = `<aside class="card" role="note"><p><strong>Seller.</strong> Ayo Ayeni, trading as Classes for Culture.</p><p>Postal address: 35 Melrose Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom.</p><p>Support: <a href="mailto:team@classesforculture.com">team@classesforculture.com</a>. No company number or VAT number is claimed.</p></aside>`;
  if (kind === "privacy") {
    return page("Privacy notice | What’s Your Bride Price?", `${shared}<h1>Privacy notice</h1><p>This notice describes the paid game.</p><h2>What the game stores</h2><ul><li>Play happens in your browser. A completed game writes a score summary and a sharded counter to Cloudflare KV. Ordinary play does not write to the database.</li><li>Purchases store an email address, country, order, Stripe reference and entitlement in Cloudflare D1 so a receipt can be sent and access can be unlocked or removed.</li><li>Card numbers stay with Stripe. This app does not store them.</li></ul><h2>Who processes data</h2><p>Cloudflare Workers serves the game and caches static assets at the edge. Stripe Checkout and Adaptive Pricing handle payment. Tax is not collected at launch, and the price shown is the final price. Receipts are sent by Resend or Postmark from a mail subdomain. Human support mail stays on Namecheap Private Email and is outside this application. Google Workspace, Google Drive and ChatGPT Sites are not part of this paid hosting path.</p><h2>Retention and rights</h2><p>Game summaries in KV are operational records for the party game. Orders are kept so refunds, disputes and statutory requests can be handled. UK and EU data-protection rights may include access, erasure and complaint to a supervisory authority.</p>`, false, "/privacy");
  }
  if (kind === "terms") {
    return page("Terms | What’s Your Bride Price?", `${shared}<h1>Terms of use</h1><p>What’s Your Bride Price? is a culture quiz for adults aged 18 and over. The score is playful and is not a measure of a person.</p><h2>Free play and paid extras</h2><p>Cowrie purchases are not offered in the EU or in Iceland, Liechtenstein, or Norway yet. The first two completed games on a browser are free. Starting each game after that costs 5 Cowries, taken when the game starts. Refreshing or retrying that same game does not charge again. Cowrie bundles are one-off purchases. The first purchase on a browser adds a welcome bonus of 5 Cowries, which is used before purchased Cowries and expires 14 days after that purchase. ${royalRevealEnabled ? "The Royal Reveal Pack is a £1.99 one-off for one finished result. It supplies a personal Royal Decree in two image sizes, a PDF of that result, and three to five notes quoted from the published question bank for that region. It is a culture quiz souvenir, not a wedding custom and not a measure of a person. A refund removes the download." : "Royal Reveal is not currently offered."} Prices shown are the final price. Stripe may present that price in the buyer's currency. Tax is not added.</p><h2>Instant digital content</h2><p>For UK, EU and EEA buyers, a Cowrie checkout asks for this acknowledgement before a session is created: ${WAIVER_TEXT}${royalRevealEnabled ? ` A Royal Reveal Pack checkout asks for this acknowledgement instead: ${ROYAL_WAIVER_TEXT}` : ""}</p><h2>Acceptable use</h2><p>Do not misuse the service, attempt to break payment checks, or present the score as a judgement of a person.</p>`, false, "/terms");
  }
  return page("Refunds | What’s Your Bride Price?", `${shared}<h1>Refunds</h1><h2>Statutory withdrawal</h2><p>For UK, EU and EEA buyers, instant digital supply requires the checkout acknowledgement that the 14-day cancellation right ends when supply starts. Cowrie bundles use the Cowrie acknowledgement. ${royalRevealEnabled ? `A Royal Reveal Pack uses this acknowledgement: ${ROYAL_WAIVER_TEXT} ` : ""}Faulty or misdescribed content still has its statutory remedies.</p><h2>Voluntary refunds</h2><p>A refund of a Cowrie purchase removes the unused Cowries from that purchase, including any unused welcome bonus that came with it. The balance does not go below zero, and Cowries already spent on a game stay spent. ${royalRevealEnabled ? "A refund of a Royal Reveal Pack removes that result's decree download. The score itself stays on the browser." : ""} Faulty or misdescribed content still has its statutory remedies.</p><h2>How to ask</h2><p>Paid purchases are not offered in the EU or in Iceland, Liechtenstein, or Norway yet. If a payment is taken for one of those countries, it is refunded to the original payment method and no pack is supplied. Email <a href="mailto:team@classesforculture.com">team@classesforculture.com</a> with the order reference from your receipt. The aim is to acknowledge the request within two working days. Stripe refunds and disputes also update access automatically when the signed webhook arrives.</p>`, false, "/refunds");
}

export function playPageHtml(): string {
  return page("What’s Your Bride Price? | The Pan-African Party Game", `<h1>What’s Your Bride Price?</h1><p>Five regions. Twelve questions. One playful culture score. The first two completed games on this browser are free. Each game after that costs 5 Cowries.</p><section id="play" class="card" aria-live="polite"><p>Loading editions…</p></section><section id="shop" class="card" hidden><h2>Optional paid extras</h2><p id="access"></p><form id="checkout"><label>Product <select name="product" id="product"></select></label><label>Email <input name="email" type="email" autocomplete="email" required maxlength="200"></label><label>Country <select name="country" id="country" required></select></label><label><input name="adult" type="checkbox" value="yes" required> I'm 18 or over.</label><label id="waiver-label" hidden><input name="waiver" type="checkbox" value="yes"> <span id="waiver-text"></span></label><button type="submit">Continue to Stripe Checkout</button><p id="shop-status" role="status"></p></form></section>
<script>
const play=document.querySelector("#play"),shop=document.querySelector("#shop");
const playerKey="wybp-player";
let player=localStorage.getItem(playerKey);
if(!player){player=crypto.randomUUID().replaceAll("-","").slice(0,32);localStorage.setItem(playerKey,player);}
const editions=()=>fetch("/api/paid/catalog").then(r=>r.json());
async function start(){
  const catalog=await editions();
  const product=document.querySelector("#product"),country=document.querySelector("#country");
  catalog.products.forEach(item=>{const option=document.createElement("option");option.value=item.key;option.textContent=item.name+" · "+item.displayPrice;product.append(option);});
  const blank=document.createElement("option");blank.value="";blank.disabled=true;blank.textContent="Choose your country";country.append(blank);
  catalog.countries.forEach(item=>{const option=document.createElement("option");option.value=item.code;option.textContent=item.name;country.append(option);});
  const known=new Set(catalog.countries.map(item=>item.code));
  country.value=typeof catalog.visitorCountry==="string"&&known.has(catalog.visitorCountry)?catalog.visitorCountry:"";
  document.querySelector("#waiver-text").textContent=catalog.waiverText;
  const waiverCountries=new Set(catalog.waiverCountries);
  const blockedCountries=new Set(catalog.blockedCountries||[]);
  const blockedMessage=catalog.purchaseBlockedMessage||"Purchases aren't available in your country yet. You can still play for free!";
  const waiverLabel=document.querySelector("#waiver-label");
  const submit=document.querySelector("#checkout button[type=submit]");
  const status=document.querySelector("#shop-status");
  function updatePurchaseAvailability(){
    const blocked=Boolean(catalog.purchasesBlocked)||blockedCountries.has(country.value);
    submit.disabled=blocked;
    waiverLabel.hidden=blocked||!waiverCountries.has(country.value);
    if(blocked) status.textContent=blockedMessage;
    else if(status.textContent===blockedMessage) status.textContent="";
  }
  country.addEventListener("change",updatePurchaseAvailability);
  updatePurchaseAvailability();
  play.innerHTML="<h2>Choose a region</h2>"+catalog.editions.map(item=>'<button type="button" data-edition="'+item.key+'">'+item.name+"</button>").join(" ");
  play.querySelectorAll("[data-edition]").forEach(button=>button.addEventListener("click",()=>round(button.dataset.edition)));
  document.querySelector("#checkout").addEventListener("submit",submitCheckout);
  shop.hidden=false;
  refreshAccess();
}
function escapeHtml(value){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
async function round(edition){
  const payload=await (await fetch("/api/paid/questions?edition="+edition+"&player="+player)).json();
  const questions=Array.isArray(payload)?payload:(payload.questions||[]);
  const roundId=Array.isArray(payload)?"":(payload.roundId||"");
  let index=0; const answers=[];
  const advance=()=>{index+=1; if(index<questions.length) ask(); else finish(edition,answers,roundId);};
  const ask=()=>{
    const question=questions[index];
    const multi=question.kind==="multi";
    const pictures=question.kind==="image"&&Array.isArray(question.images)?question.images:[];
    const choices=pictures.length?pictures.map((src,i)=>{const alt="Photo for question "+(index+1)+", choice "+String.fromCharCode(65+i);return '<button type="button" data-choice="'+i+'"><img alt="'+alt+'" src="'+escapeHtml(src)+'" width="160"></button>';}).join(""):question.options.map((label,i)=>'<button type="button" data-choice="'+i+'">'+escapeHtml(label)+"</button>").join("");
    play.innerHTML='<p>Question '+(index+1)+" of "+questions.length+"</p><h2>"+escapeHtml(question.prompt)+"</h2>"+'<div class="options">'+choices+(multi?'<button type="button" id="next">Submit selection</button>':"")+"</div>";
    const chosen=new Set();
    play.querySelectorAll("[data-choice]").forEach(button=>button.addEventListener("click",()=>{
      const choice=Number(button.dataset.choice);
      if(!multi){answers[index]=[choice];advance();return;}
      if(chosen.has(choice)) chosen.delete(choice); else chosen.add(choice);
      button.setAttribute("aria-pressed", chosen.has(choice)?"true":"false");
    }));
    const next=play.querySelector("#next");
    if(next) next.addEventListener("click",()=>{if(chosen.size===0) return; answers[index]=[...chosen]; advance();});
  };
  ask();
}
async function finish(edition,answers,roundId){
  const response=await fetch("/api/paid/games/complete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({edition,answers,playerId:player,roundId:roundId||undefined})});
  const result=await response.json();
  play.innerHTML="<h2>"+result.score+" / "+result.total+"</h2><p>"+escapeHtml(String(result.editionName||""))+"</p><p>"+escapeHtml((result.explanations||[]).map(item=>item.explanation).join(" "))+'</p><button type="button" id="again">Play another region</button>';
  document.querySelector("#again").addEventListener("click",start);
  refreshAccess();
}
async function refreshAccess(){
  const access=await (await fetch("/api/paid/access?player="+player)).json();
  document.querySelector("#access").textContent="Cowries on this browser: "+access.cowries+". Royal Reveal: "+(access.royal?"unlocked":"locked")+".";
}
async function submitCheckout(event){
  event.preventDefault();
  const data=new FormData(event.target);
  const status=document.querySelector("#shop-status");
  status.textContent="Opening checkout…";
  const response=await fetch("/api/paid/checkout",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({productKey:data.get("product"),email:data.get("email"),country:data.get("country"),playerId:player,adult:data.get("adult")==="yes",waiver:data.get("waiver")==="yes"})});
  const payload=await response.json();
  if(!response.ok){status.textContent=payload.message||"Checkout is unavailable.";return;}
  location.href=payload.url;
}
start();
</script>`, true);
}

export function mockCheckoutHtml(orderId: string): string {
  return page("Test checkout", `<h1>Stripe test checkout</h1><p>No live charge is created. This page exists only when the Worker is in mock mode.</p><form method="post" action="/api/paid/mock-pay"><input type="hidden" name="orderId" value="${orderId}"><label>Test card <input value="4242 4242 4242 4242" readonly></label><button type="submit">Pay in test mode</button></form>`, false);
}

export function returnHtml(summary: string): string {
  return page("Payment return", `<h1>Payment</h1><p>${summary}</p><p><a href="/">Back to the game</a></p>`, false);
}
